import { logger } from '@/ui/logger';

type ConvertedEvent = {
    type: string;
    [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractItemId(params: Record<string, unknown>): string | null {
    const direct = asString(params.itemId ?? params.item_id ?? params.id);
    if (direct) return direct;

    const item = asRecord(params.item);
    if (item) {
        return asString(item.id ?? item.itemId ?? item.item_id);
    }

    return null;
}

function extractItem(params: Record<string, unknown>): Record<string, unknown> | null {
    const item = asRecord(params.item);
    return item ?? params;
}

function normalizeItemType(value: unknown): string | null {
    const raw = asString(value);
    if (!raw) return null;
    return raw.toLowerCase().replace(/[\s_-]/g, '');
}

function extractCommand(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        const parts = value.filter((part): part is string => typeof part === 'string');
        return parts.length > 0 ? parts.join(' ') : null;
    }
    return null;
}

function extractChanges(value: unknown): Record<string, unknown> | null {
    const record = asRecord(value);
    if (record) return record;

    if (Array.isArray(value)) {
        const changes: Record<string, unknown> = {};
        for (const entry of value) {
            const entryRecord = asRecord(entry);
            if (!entryRecord) continue;
            const path = asString(entryRecord.path ?? entryRecord.file ?? entryRecord.filePath ?? entryRecord.file_path);
            if (path) {
                changes[path] = entryRecord;
            }
        }
        return Object.keys(changes).length > 0 ? changes : null;
    }

    return null;
}

function extractTextFromContent(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value)) {
        const parts: string[] = [];
        for (const entry of value) {
            const record = asRecord(entry);
            if (!record) continue;
            const text = asString(record.text ?? record.message ?? record.content);
            if (text) {
                parts.push(text);
            }
        }
        return parts.length > 0 ? parts.join('') : null;
    }

    const record = asRecord(value);
    if (!record) return null;
    return asString(record.text ?? record.message ?? record.content);
}

export class AppServerEventConverter {
    private readonly agentMessageBuffers = new Map<string, string>();
    private readonly reasoningBuffers = new Map<string, string>();
    private readonly commandOutputBuffers = new Map<string, string>();
    private readonly commandMeta = new Map<string, Record<string, unknown>>();
    private readonly fileChangeMeta = new Map<string, Record<string, unknown>>();
    private readonly fileChangeOutputBuffers = new Map<string, string>();

    private handleCodexEventNotification(method: string, paramsRecord: Record<string, unknown>): ConvertedEvent[] | null {
        if (!method.startsWith('codex/event/')) {
            return null;
        }

        const msg = asRecord(paramsRecord.msg);
        if (!msg) {
            return [];
        }

        const eventType = asString(msg.type) ?? method.slice('codex/event/'.length);
        const events: ConvertedEvent[] = [];
        const turnId = asString(msg.turn_id ?? msg.turnId ?? paramsRecord.id);

        if (eventType === 'task_started') {
            events.push({ type: 'task_started', ...(turnId ? { turn_id: turnId } : {}) });
            return events;
        }

        if (eventType === 'task_complete') {
            const lastAgentMessage = asString(msg.last_agent_message ?? msg.lastAgentMessage);
            if (lastAgentMessage) {
                events.push({ type: 'agent_message', message: lastAgentMessage });
            }
            events.push({ type: 'task_complete', ...(turnId ? { turn_id: turnId } : {}) });
            return events;
        }

        if (eventType === 'error') {
            const message = asString(msg.message) ?? asString(asRecord(msg.error)?.message);
            if (message) {
                events.push({ type: 'task_failed', ...(turnId ? { turn_id: turnId } : {}), error: message });
            }
            return events;
        }

        if (eventType === 'agent_message') {
            const message = asString(msg.message);
            if (message) {
                events.push({ type: 'agent_message', message });
            }
            return events;
        }

        if (eventType === 'agent_message_delta' || eventType === 'agent_message_content_delta') {
            const itemId = asString(msg.item_id ?? msg.itemId);
            const delta = asString(msg.delta ?? msg.text ?? msg.message);
            if (itemId && delta) {
                const prev = this.agentMessageBuffers.get(itemId) ?? '';
                this.agentMessageBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (eventType === 'agent_reasoning_section_break') {
            events.push({ type: 'agent_reasoning_section_break' });
            return events;
        }

        if (eventType === 'agent_reasoning_delta' || eventType === 'reasoning_content_delta') {
            const itemId = asString(msg.item_id ?? msg.itemId) ?? 'reasoning';
            const delta = asString(msg.delta ?? msg.text ?? msg.message);
            if (delta) {
                const prev = this.reasoningBuffers.get(itemId) ?? '';
                this.reasoningBuffers.set(itemId, prev + delta);
                events.push({ type: 'agent_reasoning_delta', delta });
            }
            return events;
        }

        if (eventType === 'agent_reasoning') {
            const itemId = asString(msg.item_id ?? msg.itemId) ?? 'reasoning';
            const text = asString(msg.text ?? msg.message) ?? this.reasoningBuffers.get(itemId);
            if (text) {
                events.push({ type: 'agent_reasoning', text });
            }
            this.reasoningBuffers.delete(itemId);
            return events;
        }

        if (eventType === 'exec_command_begin') {
            const callId = asString(msg.call_id ?? msg.callId ?? msg.item_id ?? msg.itemId);
            if (!callId) {
                return events;
            }
            const command = extractCommand(msg.command ?? msg.cmd ?? msg.args);
            const cwd = asString(msg.cwd ?? msg.workingDirectory ?? msg.working_directory);
            const autoApproved = asBoolean(msg.autoApproved ?? msg.auto_approved);
            const meta: Record<string, unknown> = {};
            if (command) meta.command = command;
            if (cwd) meta.cwd = cwd;
            if (autoApproved !== null) meta.auto_approved = autoApproved;
            this.commandMeta.set(callId, meta);
            events.push({ type: 'exec_command_begin', call_id: callId, ...meta });
            return events;
        }

        if (eventType === 'exec_command_output_delta') {
            const callId = asString(msg.call_id ?? msg.callId ?? msg.item_id ?? msg.itemId);
            const delta = asString(msg.delta ?? msg.text ?? msg.output ?? msg.stdout);
            if (callId && delta) {
                const prev = this.commandOutputBuffers.get(callId) ?? '';
                this.commandOutputBuffers.set(callId, prev + delta);
            }
            return events;
        }

        if (eventType === 'exec_command_end') {
            const callId = asString(msg.call_id ?? msg.callId ?? msg.item_id ?? msg.itemId);
            if (!callId) {
                return events;
            }
            const meta = this.commandMeta.get(callId) ?? {};
            const output = asString(msg.output ?? msg.result ?? msg.stdout) ?? this.commandOutputBuffers.get(callId);
            const stderr = asString(msg.stderr);
            const error = asString(msg.error);
            const exitCode = asNumber(msg.exitCode ?? msg.exit_code ?? msg.exitcode);
            const status = asString(msg.status);

            events.push({
                type: 'exec_command_end',
                call_id: callId,
                ...meta,
                ...(output ? { output } : {}),
                ...(stderr ? { stderr } : {}),
                ...(error ? { error } : {}),
                ...(exitCode !== null ? { exit_code: exitCode } : {}),
                ...(status ? { status } : {})
            });

            this.commandMeta.delete(callId);
            this.commandOutputBuffers.delete(callId);
            return events;
        }

        if (eventType === 'patch_apply_begin') {
            const callId = asString(msg.call_id ?? msg.callId ?? msg.item_id ?? msg.itemId);
            if (!callId) {
                return events;
            }
            const changes = extractChanges(msg.changes ?? msg.change ?? msg.diff);
            const autoApproved = asBoolean(msg.autoApproved ?? msg.auto_approved);
            const meta: Record<string, unknown> = {};
            if (changes) meta.changes = changes;
            if (autoApproved !== null) meta.auto_approved = autoApproved;
            this.fileChangeMeta.set(callId, meta);
            events.push({ type: 'patch_apply_begin', call_id: callId, ...meta });
            return events;
        }

        if (eventType === 'patch_apply_end') {
            const callId = asString(msg.call_id ?? msg.callId ?? msg.item_id ?? msg.itemId);
            if (!callId) {
                return events;
            }
            const meta = this.fileChangeMeta.get(callId) ?? {};
            const stdout = asString(msg.stdout ?? msg.output) ?? this.fileChangeOutputBuffers.get(callId);
            const stderr = asString(msg.stderr);
            const success = asBoolean(msg.success ?? msg.ok ?? msg.applied ?? msg.status === 'completed');
            events.push({
                type: 'patch_apply_end',
                call_id: callId,
                ...meta,
                ...(stdout ? { stdout } : {}),
                ...(stderr ? { stderr } : {}),
                success: success ?? false
            });
            this.fileChangeMeta.delete(callId);
            this.fileChangeOutputBuffers.delete(callId);
            return events;
        }

        if (eventType === 'turn_diff') {
            const diff = asString(msg.unified_diff ?? msg.unifiedDiff ?? msg.diff);
            if (diff) {
                events.push({ type: 'turn_diff', unified_diff: diff });
            }
            return events;
        }

        if (eventType === 'token_count') {
            const info = asRecord(msg.info) ?? {};
            events.push({ type: 'token_count', info });
            return events;
        }

        if (eventType === 'item_started' || eventType === 'item_completed') {
            const item = asRecord(msg.item);
            if (!item) {
                return events;
            }
            const mappedEvents = this.handleNotification(
                eventType === 'item_started' ? 'item/started' : 'item/completed',
                {
                    item,
                    threadId: msg.thread_id ?? msg.threadId,
                    turnId: msg.turn_id ?? msg.turnId
                }
            );
            events.push(...mappedEvents);
            return events;
        }

        if (
            eventType === 'user_message'
            || eventType === 'mcp_startup_update'
            || eventType === 'mcp_startup_complete'
            || eventType === 'mcp_tool_call_begin'
            || eventType === 'mcp_tool_call_end'
            || eventType === 'skills_update_available'
            || eventType === 'web_search_begin'
            || eventType === 'web_search_end'
            || eventType === 'context_compacted'
            || eventType === 'plan_update'
            || eventType === 'terminal_interaction'
        ) {
            return events;
        }

        return null;
    }

    handleNotification(method: string, params: unknown): ConvertedEvent[] {
        const events: ConvertedEvent[] = [];
        const paramsRecord = asRecord(params) ?? {};

        const wrappedEvents = this.handleCodexEventNotification(method, paramsRecord);
        if (wrappedEvents) {
            return wrappedEvents;
        }

        if (method === 'thread/started' || method === 'thread/resumed') {
            const thread = asRecord(paramsRecord.thread) ?? paramsRecord;
            const threadId = asString(thread.threadId ?? thread.thread_id ?? thread.id);
            if (threadId) {
                events.push({ type: 'thread_started', thread_id: threadId });
            }
            return events;
        }

        if (method === 'turn/started') {
            const turn = asRecord(paramsRecord.turn) ?? paramsRecord;
            const turnId = asString(turn.turnId ?? turn.turn_id ?? turn.id);
            events.push({ type: 'task_started', ...(turnId ? { turn_id: turnId } : {}) });
            return events;
        }

        if (method === 'turn/completed') {
            const turn = asRecord(paramsRecord.turn) ?? paramsRecord;
            const statusRaw = asString(paramsRecord.status ?? turn.status);
            const status = statusRaw?.toLowerCase();
            const turnId = asString(turn.turnId ?? turn.turn_id ?? turn.id);
            const errorMessage = asString(paramsRecord.error ?? paramsRecord.message ?? paramsRecord.reason);

            if (status === 'interrupted' || status === 'cancelled' || status === 'canceled') {
                events.push({ type: 'turn_aborted', ...(turnId ? { turn_id: turnId } : {}) });
                return events;
            }

            if (status === 'failed' || status === 'error') {
                events.push({ type: 'task_failed', ...(turnId ? { turn_id: turnId } : {}), ...(errorMessage ? { error: errorMessage } : {}) });
                return events;
            }

            events.push({ type: 'task_complete', ...(turnId ? { turn_id: turnId } : {}) });
            return events;
        }

        if (method === 'turn/diff/updated') {
            const diff = asString(paramsRecord.diff ?? paramsRecord.unified_diff ?? paramsRecord.unifiedDiff);
            if (diff) {
                events.push({ type: 'turn_diff', unified_diff: diff });
            }
            return events;
        }

        if (method === 'thread/tokenUsage/updated') {
            const info = asRecord(paramsRecord.tokenUsage ?? paramsRecord.token_usage ?? paramsRecord) ?? {};
            events.push({ type: 'token_count', info });
            return events;
        }

        if (method === 'error') {
            const willRetry = asBoolean(paramsRecord.will_retry ?? paramsRecord.willRetry) ?? false;
            if (willRetry) return events;
            const message = asString(paramsRecord.message) ?? asString(asRecord(paramsRecord.error)?.message);
            if (message) {
                events.push({ type: 'task_failed', error: message });
            }
            return events;
        }

        if (method === 'item/agentMessage/delta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.message);
            if (itemId && delta) {
                const prev = this.agentMessageBuffers.get(itemId) ?? '';
                this.agentMessageBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (method === 'item/reasoning/textDelta' || method === 'item/reasoning/summaryTextDelta') {
            const itemId = extractItemId(paramsRecord) ?? 'reasoning';
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.message);
            if (delta) {
                const prev = this.reasoningBuffers.get(itemId) ?? '';
                this.reasoningBuffers.set(itemId, prev + delta);
                events.push({ type: 'agent_reasoning_delta', delta });
            }
            return events;
        }

        if (method === 'item/reasoning/summaryPartAdded') {
            events.push({ type: 'agent_reasoning_section_break' });
            return events;
        }

        if (method === 'item/commandExecution/outputDelta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.output ?? paramsRecord.stdout);
            if (itemId && delta) {
                const prev = this.commandOutputBuffers.get(itemId) ?? '';
                this.commandOutputBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (method === 'item/fileChange/outputDelta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.output ?? paramsRecord.stdout);
            if (itemId && delta) {
                const prev = this.fileChangeOutputBuffers.get(itemId) ?? '';
                this.fileChangeOutputBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (method === 'item/started' || method === 'item/completed') {
            const item = extractItem(paramsRecord);
            if (!item) return events;

            const itemType = normalizeItemType(item.type ?? item.itemType ?? item.kind);
            const itemId = extractItemId(paramsRecord) ?? asString(item.id ?? item.itemId ?? item.item_id);

            if (!itemType || !itemId) {
                return events;
            }

            if (itemType === 'usermessage') {
                return events;
            }

            if (itemType === 'agentmessage') {
                if (method === 'item/completed') {
                    const text = asString(item.text ?? item.message)
                        ?? extractTextFromContent(item.content)
                        ?? this.agentMessageBuffers.get(itemId);
                    if (text) {
                        events.push({ type: 'agent_message', message: text });
                    }
                    this.agentMessageBuffers.delete(itemId);
                }
                return events;
            }

            if (itemType === 'reasoning') {
                if (method === 'item/completed') {
                    const text = asString(item.text ?? item.message)
                        ?? extractTextFromContent(item.content)
                        ?? this.reasoningBuffers.get(itemId);
                    if (text) {
                        events.push({ type: 'agent_reasoning', text });
                    }
                    this.reasoningBuffers.delete(itemId);
                }
                return events;
            }

            if (itemType === 'commandexecution') {
                if (method === 'item/started') {
                    const command = extractCommand(item.command ?? item.cmd ?? item.args);
                    const cwd = asString(item.cwd ?? item.workingDirectory ?? item.working_directory);
                    const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved);
                    const meta: Record<string, unknown> = {};
                    if (command) meta.command = command;
                    if (cwd) meta.cwd = cwd;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    this.commandMeta.set(itemId, meta);

                    events.push({
                        type: 'exec_command_begin',
                        call_id: itemId,
                        ...meta
                    });
                }

                if (method === 'item/completed') {
                    const meta = this.commandMeta.get(itemId) ?? {};
                    const output = asString(item.output ?? item.result ?? item.stdout) ?? this.commandOutputBuffers.get(itemId);
                    const stderr = asString(item.stderr);
                    const error = asString(item.error);
                    const exitCode = asNumber(item.exitCode ?? item.exit_code ?? item.exitcode);
                    const status = asString(item.status);

                    events.push({
                        type: 'exec_command_end',
                        call_id: itemId,
                        ...meta,
                        ...(output ? { output } : {}),
                        ...(stderr ? { stderr } : {}),
                        ...(error ? { error } : {}),
                        ...(exitCode !== null ? { exit_code: exitCode } : {}),
                        ...(status ? { status } : {})
                    });

                    this.commandMeta.delete(itemId);
                    this.commandOutputBuffers.delete(itemId);
                }

                return events;
            }

            if (itemType === 'filechange') {
                if (method === 'item/started') {
                    const changes = extractChanges(item.changes ?? item.change ?? item.diff);
                    const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved);
                    const meta: Record<string, unknown> = {};
                    if (changes) meta.changes = changes;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    this.fileChangeMeta.set(itemId, meta);

                    events.push({
                        type: 'patch_apply_begin',
                        call_id: itemId,
                        ...meta
                    });
                }

                if (method === 'item/completed') {
                    const meta = this.fileChangeMeta.get(itemId) ?? {};
                    const stdout = asString(item.stdout ?? item.output) ?? this.fileChangeOutputBuffers.get(itemId);
                    const stderr = asString(item.stderr);
                    const success = asBoolean(item.success ?? item.ok ?? item.applied ?? item.status === 'completed');

                    events.push({
                        type: 'patch_apply_end',
                        call_id: itemId,
                        ...meta,
                        ...(stdout ? { stdout } : {}),
                        ...(stderr ? { stderr } : {}),
                        success: success ?? false
                    });

                    this.fileChangeMeta.delete(itemId);
                    this.fileChangeOutputBuffers.delete(itemId);
                }

                return events;
            }
        }

        logger.debug('[AppServerEventConverter] Unhandled notification', { method, params });
        return events;
    }

    reset(): void {
        this.agentMessageBuffers.clear();
        this.reasoningBuffers.clear();
        this.commandOutputBuffers.clear();
        this.commandMeta.clear();
        this.fileChangeMeta.clear();
        this.fileChangeOutputBuffers.clear();
    }
}
