import type { AgentState } from '@/api/types';
import { logger } from '@/ui/logger';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { AgentRegistry } from '@/agent/AgentRegistry';
import { convertAgentMessage } from '@/agent/messageConverter';
import { PermissionAdapter } from '@/agent/permissionAdapter';
import type { AgentBackend, PromptContent } from '@/agent/types';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { getHappyCliCommand } from '@/utils/spawnHappyCLI';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { bootstrapSession } from '@/agent/sessionFactory';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';

function emitReadyIfIdle(props: {
    queueSize: () => number;
    shouldExit: boolean;
    thinking: boolean;
    sendReady: () => void;
}): void {
    if (props.shouldExit) return;
    if (props.thinking) return;
    if (props.queueSize() > 0) return;
    props.sendReady();
}

export async function runAgentSession(opts: {
    agentType: string;
    startedBy?: 'runner' | 'terminal';
}): Promise<void> {
    const initialState: AgentState = {
        controlledByUser: false
    };

    const { session } = await bootstrapSession({
        flavor: opts.agentType,
        startedBy: opts.startedBy ?? 'terminal',
        workingDirectory: process.cwd(),
        agentState: initialState
    });

    session.updateAgentState((currentState) => ({
        ...currentState,
        controlledByUser: false
    }));

    const messageQueue = new MessageQueue2<Record<string, never>>(() => hashObject({}));

    session.onUserMessage((message) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments);
        messageQueue.push(formattedText, {});
    });

    let thinking = false;
    let shouldExit = false;
    let waitAbortController: AbortController | null = null;

    let keepAliveInterval: NodeJS.Timeout | null = null;
    let backend: AgentBackend | null = null;
    let permissionAdapter: PermissionAdapter | null = null;
    let happyServer: Awaited<ReturnType<typeof startHappyServer>> | null = null;

    // Mark session as active as early as possible.
    // Important: register onUserMessage before allowing webapp sends.
    session.keepAlive(thinking, 'remote');
    keepAliveInterval = setInterval(() => {
        session.keepAlive(thinking, 'remote');
    }, 2000);

    try {
        backend = AgentRegistry.create(opts.agentType);
        await backend.initialize();

        permissionAdapter = new PermissionAdapter(session, backend);

        happyServer = await startHappyServer(session);
        const bridgeCommand = getHappyCliCommand(['mcp', '--url', happyServer.url]);
        const mcpServers = [
            {
                name: 'happy',
                command: bridgeCommand.command,
                args: bridgeCommand.args,
                env: []
            }
        ];

        const agentSessionId = await backend.newSession({
            cwd: process.cwd(),
            mcpServers
        });

        const sendReady = () => {
            session.sendSessionEvent({ type: 'ready' });
        };

        const handleAbort = async () => {
            logger.debug('[ACP] Abort requested');
            await backend.cancelPrompt(agentSessionId);
            await permissionAdapter.cancelAll('User aborted');
            thinking = false;
            session.keepAlive(thinking, 'remote');
            sendReady();
            if (waitAbortController) {
                waitAbortController.abort();
            }
        };

        session.rpcHandlerManager.registerHandler('abort', async () => {
            await handleAbort();
        });

        const handleKillSession = async () => {
            if (shouldExit) return;
            shouldExit = true;
            await permissionAdapter.cancelAll('Session killed');
            if (waitAbortController) {
                waitAbortController.abort();
            }
        };

        registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

        while (!shouldExit) {
            waitAbortController = new AbortController();
            const batch = await messageQueue.waitForMessagesAndGetAsString(waitAbortController.signal);
            waitAbortController = null;
            if (!batch) {
                if (shouldExit) {
                    break;
                }
                continue;
            }

            const promptContent: PromptContent[] = [{
                type: 'text',
                text: batch.message
            }];

            thinking = true;
            session.keepAlive(thinking, 'remote');

            try {
                await backend.prompt(agentSessionId, promptContent, (message) => {
                    const converted = convertAgentMessage(message);
                    if (converted) {
                        session.sendCodexMessage(converted);
                    }
                });
            } catch (error) {
                logger.warn('[ACP] Prompt failed', error);
                session.sendSessionEvent({
                    type: 'message',
                    message: 'Agent prompt failed. Check logs for details.'
                });
            } finally {
                thinking = false;
                session.keepAlive(thinking, 'remote');
                await permissionAdapter.cancelAll('Prompt finished');
                emitReadyIfIdle({
                    queueSize: () => messageQueue.size(),
                    shouldExit,
                    thinking,
                    sendReady
                });
            }
        }
    } finally {
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }

        try {
            if (permissionAdapter) {
                await permissionAdapter.cancelAll('Session ended');
            }
        } catch (error) {
            logger.debug('[ACP] permission cleanup failed', error);
        }

        try {
            session.sendSessionDeath();
            await session.flush();
            session.close();
        } catch (error) {
            logger.debug('[ACP] session cleanup failed', error);
        }

        try {
            if (backend) {
                await backend.disconnect();
            }
        } catch (error) {
            logger.debug('[ACP] backend.disconnect failed', error);
        }

        try {
            if (happyServer) {
                happyServer.stop();
            }
        } catch (error) {
            logger.debug('[ACP] happyServer.stop failed', error);
        }
    }
}
