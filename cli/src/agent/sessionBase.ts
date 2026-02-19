import { ApiClient, ApiSessionClient } from '@/lib';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { Metadata, SessionModelMode, SessionPermissionMode, SessionReasoningEffort } from '@/api/types';
import { logger } from '@/ui/logger';

export type AgentSessionBaseOptions<Mode> = {
    api: ApiClient;
    client: ApiSessionClient;
    path: string;
    logPath: string;
    sessionId: string | null;
    messageQueue: MessageQueue2<Mode>;
    onModeChange: (mode: 'local' | 'remote') => void;
    mode?: 'local' | 'remote';
    sessionLabel: string;
    sessionIdLabel: string;
    applySessionIdToMetadata: (metadata: Metadata, sessionId: string) => Metadata;
    permissionMode?: SessionPermissionMode;
    modelMode?: SessionModelMode;
    reasoningEffort?: SessionReasoningEffort;
    runtimeConfigVersion?: number;
};

export class AgentSessionBase<Mode> {
    readonly path: string;
    readonly logPath: string;
    readonly api: ApiClient;
    readonly client: ApiSessionClient;
    readonly queue: MessageQueue2<Mode>;
    protected readonly _onModeChange: (mode: 'local' | 'remote') => void;

    sessionId: string | null;
    mode: 'local' | 'remote' = 'local';
    thinking: boolean = false;
    thinkingSince: number | null = null;

    private sessionFoundCallbacks: ((sessionId: string) => void)[] = [];
    private readonly applySessionIdToMetadata: (metadata: Metadata, sessionId: string) => Metadata;
    private readonly sessionLabel: string;
    private readonly sessionIdLabel: string;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    protected permissionMode?: SessionPermissionMode;
    protected modelMode?: SessionModelMode;
    protected reasoningEffort?: SessionReasoningEffort;
    protected runtimeConfigVersion?: number;

    constructor(opts: AgentSessionBaseOptions<Mode>) {
        this.path = opts.path;
        this.api = opts.api;
        this.client = opts.client;
        this.logPath = opts.logPath;
        this.sessionId = opts.sessionId;
        this.queue = opts.messageQueue;
        this._onModeChange = opts.onModeChange;
        this.applySessionIdToMetadata = opts.applySessionIdToMetadata;
        this.sessionLabel = opts.sessionLabel;
        this.sessionIdLabel = opts.sessionIdLabel;
        this.mode = opts.mode ?? 'local';
        this.permissionMode = opts.permissionMode;
        this.modelMode = opts.modelMode;
        this.reasoningEffort = opts.reasoningEffort;
        this.runtimeConfigVersion = opts.runtimeConfigVersion;

        this.client.keepAlive(this.thinking, this.mode, this.getKeepAliveRuntime(), this.thinkingSince);
        this.keepAliveInterval = setInterval(() => {
            this.client.keepAlive(this.thinking, this.mode, this.getKeepAliveRuntime(), this.thinkingSince);
        }, 2000);

    }

    onThinkingChange = (thinking: boolean) => {
        if (this.thinking !== thinking) {
            this.thinkingSince = thinking ? Date.now() : null;
        } else if (thinking && this.thinkingSince === null) {
            // Self-heal: if we lost the start time but are still thinking, restart the timer.
            this.thinkingSince = Date.now();
        }
        this.thinking = thinking;
        this.client.keepAlive(thinking, this.mode, this.getKeepAliveRuntime(), this.thinkingSince);
    };

    onModeChange = (mode: 'local' | 'remote') => {
        this.mode = mode;
        this.client.keepAlive(this.thinking, mode, this.getKeepAliveRuntime(), this.thinkingSince);
        const permissionLabel = this.permissionMode ?? 'unset';
        const modelLabel = this.modelMode ?? 'unset';
        const reasoningEffortLabel = this.reasoningEffort ?? 'unset';
        logger.debug(`[${this.sessionLabel}] Mode switched to ${mode} (permissionMode=${permissionLabel}, modelMode=${modelLabel}, reasoningEffort=${reasoningEffortLabel})`);
        this._onModeChange(mode);
    };

    onSessionFound = (sessionId: string) => {
        this.sessionId = sessionId;
        this.client.updateMetadata((metadata) => this.applySessionIdToMetadata(metadata, sessionId));
        logger.debug(`[${this.sessionLabel}] ${this.sessionIdLabel} session ID ${sessionId} added to metadata`);

        for (const callback of this.sessionFoundCallbacks) {
            callback(sessionId);
        }
    };

    addSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        this.sessionFoundCallbacks.push(callback);
    };

    removeSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        const index = this.sessionFoundCallbacks.indexOf(callback);
        if (index !== -1) {
            this.sessionFoundCallbacks.splice(index, 1);
        }
    };

    stopKeepAlive = (): void => {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    };

    protected getKeepAliveRuntime(): {
        runtimeConfigVersion?: number;
        permissionMode?: SessionPermissionMode;
        modelMode?: SessionModelMode;
        reasoningEffort?: SessionReasoningEffort;
    } | undefined {
        if (
            this.runtimeConfigVersion === undefined
            && this.permissionMode === undefined
            && this.modelMode === undefined
            && this.reasoningEffort === undefined
        ) {
            return undefined;
        }
        return {
            runtimeConfigVersion: this.runtimeConfigVersion,
            permissionMode: this.permissionMode,
            modelMode: this.modelMode,
            reasoningEffort: this.reasoningEffort
        };
    }

    getPermissionMode(): SessionPermissionMode | undefined {
        return this.permissionMode;
    }

    getModelMode(): SessionModelMode | undefined {
        return this.modelMode;
    }

    getReasoningEffort(): SessionReasoningEffort | undefined {
        return this.reasoningEffort;
    }

    setReasoningEffort(effort: SessionReasoningEffort | undefined): void {
        this.reasoningEffort = effort;
    }

    setRuntimeConfigVersion(version: number): void {
        this.runtimeConfigVersion = version;
    }

    getRuntimeConfigVersion(): number | undefined {
        return this.runtimeConfigVersion;
    }
}
