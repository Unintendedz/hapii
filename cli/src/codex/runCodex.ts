import { logger } from '@/ui/logger';
import { loop, type EnhancedMode, type PermissionMode } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import type { AgentState } from '@/api/types';
import type { CodexSession } from './session';
import { parseCodexCliOverrides } from './utils/codexCliOverrides';
import { bootstrapSession } from '@/agent/sessionFactory';
import { createModeChangeHandler, createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle';
import { isPermissionModeAllowedForFlavor } from '@hapi/protocol';
import { PermissionModeSchema, ReasoningEffortSchema } from '@hapi/protocol/schemas';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { parseCodexNewCommand } from './utils/codexSlashCommands';
import type { ReasoningEffort } from '@hapi/protocol/types';

export { emitReadyIfIdle } from './utils/emitReadyIfIdle';

export function enqueueCodexUserMessage(opts: {
    messageQueue: MessageQueue2<EnhancedMode>;
    rawText: string;
    formattedText: string;
    enhancedMode: EnhancedMode;
}): void {
    const newCommand = parseCodexNewCommand(opts.rawText);
    if (newCommand.isNew) {
        opts.messageQueue.pushIsolateAndClear(opts.rawText, opts.enhancedMode);
        return;
    }

    opts.messageQueue.push(opts.formattedText, opts.enhancedMode);
}

export async function runCodex(opts: {
    startedBy?: 'runner' | 'terminal';
    startingMode?: 'local' | 'remote';
    codexArgs?: string[];
    permissionMode?: PermissionMode;
    resumeSessionId?: string;
    model?: string;
}): Promise<void> {
    const workingDirectory = process.cwd();
    const startedBy = opts.startedBy ?? 'terminal';

    logger.debug(`[codex] Starting with options: startedBy=${startedBy}, startingMode=${opts.startingMode}`);

    let state: AgentState = {
        controlledByUser: false
    };
    const { api, session } = await bootstrapSession({
        flavor: 'codex',
        startedBy,
        workingDirectory,
        agentState: state
    });

    if (startedBy === 'runner' && opts.startingMode === 'local') {
        logger.debug('[codex] Runner spawn requested with local mode - forcing remote mode');
        opts.startingMode = 'remote';
    }

    const startingMode: 'local' | 'remote' = opts.startingMode ?? (startedBy === 'runner' ? 'remote' : 'local');

    setControlledByUser(session, startingMode);

    let startupKeepAliveInterval: NodeJS.Timeout | null = setInterval(() => {
        session.keepAlive(false, startingMode);
    }, 2000);
    session.keepAlive(false, startingMode);

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        collaborationMode: mode.collaborationMode,
        reasoningEffort: mode.reasoningEffort
    }));

    const codexCliOverrides = parseCodexCliOverrides(opts.codexArgs);
    const sessionWrapperRef: { current: CodexSession | null } = { current: null };

    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default';
    let currentRuntimeConfigVersion = 0;
    let currentReasoningEffort: ReasoningEffort = 'auto';
    const currentModel = opts.model;
    session.updateMetadata((m) => ({ ...m, resolvedModel: currentModel ?? 'auto' }));
    let currentCollaborationMode: EnhancedMode['collaborationMode'];

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'codex',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive()
    });

    lifecycle.registerProcessHandlers();
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit);

    const syncSessionMode = () => {
        const sessionInstance = sessionWrapperRef.current;
        if (!sessionInstance) {
            return;
        }
        sessionInstance.setPermissionMode(currentPermissionMode);
        sessionInstance.setReasoningEffort(currentReasoningEffort);
        sessionInstance.setRuntimeConfigVersion(currentRuntimeConfigVersion);
        logger.debug(`[Codex] Synced session mode for keepalive: runtimeConfigVersion=${currentRuntimeConfigVersion}, permissionMode=${currentPermissionMode}, reasoningEffort=${currentReasoningEffort}`);
    };

    session.onUserMessage((message) => {
        const messagePermissionMode = currentPermissionMode;
        logger.debug(`[Codex] User message received with permission mode: ${currentPermissionMode}`);

        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode ?? 'default',
            model: currentModel,
            collaborationMode: currentCollaborationMode,
            reasoningEffort: currentReasoningEffort
        };
        const rawText = message.content.text;
        const formattedText = formatMessageWithAttachments(rawText, message.content.attachments);

        enqueueCodexUserMessage({
            messageQueue,
            rawText,
            formattedText,
            enhancedMode
        });
    });

    const formatFailureReason = (message: string): string => {
        const maxLength = 200;
        if (message.length <= maxLength) {
            return message;
        }
        return `${message.slice(0, maxLength)}...`;
    };

    const resolvePermissionMode = (value: unknown): PermissionMode => {
        const parsed = PermissionModeSchema.safeParse(value);
        if (!parsed.success || !isPermissionModeAllowedForFlavor(parsed.data, 'codex')) {
            throw new Error('Invalid permission mode');
        }
        return parsed.data as PermissionMode;
    };

    const resolveCollaborationMode = (value: unknown): EnhancedMode['collaborationMode'] => {
        if (value === null) {
            return undefined;
        }
        if (typeof value !== 'string') {
            throw new Error('Invalid collaboration mode');
        }
        const trimmed = value.trim();
        if (!trimmed) {
            throw new Error('Invalid collaboration mode');
        }
        return trimmed as EnhancedMode['collaborationMode'];
    };

    const resolveReasoningEffort = (value: unknown): ReasoningEffort => {
        const parsed = ReasoningEffortSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error('Invalid reasoning effort');
        }
        return parsed.data;
    };

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid session config payload');
        }
        const config = payload as {
            permissionMode?: unknown;
            collaborationMode?: unknown;
            reasoningEffort?: unknown;
            runtimeConfigVersion?: unknown;
        };

        if (config.runtimeConfigVersion !== undefined) {
            const version = config.runtimeConfigVersion;
            if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
                throw new Error('Invalid runtime config version');
            }
            if (version < currentRuntimeConfigVersion) {
                throw new Error('Stale runtime config version');
            }
            currentRuntimeConfigVersion = version;
        }

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionMode(config.permissionMode);
        }

        if (config.collaborationMode !== undefined) {
            currentCollaborationMode = resolveCollaborationMode(config.collaborationMode);
        }

        if (config.reasoningEffort !== undefined) {
            currentReasoningEffort = resolveReasoningEffort(config.reasoningEffort);
        }

        syncSessionMode();
        return {
            applied: {
                runtimeConfigVersion: currentRuntimeConfigVersion,
                permissionMode: currentPermissionMode,
                collaborationMode: currentCollaborationMode,
                reasoningEffort: currentReasoningEffort
            }
        };
    });

    try {
        if (startupKeepAliveInterval) {
            clearInterval(startupKeepAliveInterval);
            startupKeepAliveInterval = null;
        }

        await loop({
            path: workingDirectory,
            startingMode,
            messageQueue,
            api,
            session,
            codexArgs: opts.codexArgs,
            codexCliOverrides,
            startedBy,
            permissionMode: currentPermissionMode,
            reasoningEffort: currentReasoningEffort,
            resumeSessionId: opts.resumeSessionId,
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                syncSessionMode();
            }
        });
    } catch (error) {
        lifecycle.markCrash(error);
        logger.debug('[codex] Loop error:', error);
    } finally {
        const localFailure = sessionWrapperRef.current?.localLaunchFailure;
        if (localFailure?.exitReason === 'exit') {
            lifecycle.setExitCode(1);
            lifecycle.setArchiveReason(`Local launch failed: ${formatFailureReason(localFailure.message)}`);
        }
        await lifecycle.cleanupAndExit();
    }
}
