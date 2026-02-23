import { describe, expect, it } from 'vitest';
import { AppServerEventConverter } from './appServerEventConverter';

describe('AppServerEventConverter', () => {
    it('maps thread/started', () => {
        const converter = new AppServerEventConverter();
        const events = converter.handleNotification('thread/started', { thread: { id: 'thread-1' } });

        expect(events).toEqual([{ type: 'thread_started', thread_id: 'thread-1' }]);
    });

    it('maps thread/resumed', () => {
        const converter = new AppServerEventConverter();
        const events = converter.handleNotification('thread/resumed', { thread: { id: 'thread-2' } });

        expect(events).toEqual([{ type: 'thread_started', thread_id: 'thread-2' }]);
    });

    it('maps turn/started and completed statuses', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('turn/started', { turn: { id: 'turn-1' } });
        expect(started).toEqual([{ type: 'task_started', turn_id: 'turn-1' }]);

        const completed = converter.handleNotification('turn/completed', { turn: { id: 'turn-1' }, status: 'Completed' });
        expect(completed).toEqual([{ type: 'task_complete', turn_id: 'turn-1' }]);

        const interrupted = converter.handleNotification('turn/completed', { turn: { id: 'turn-1' }, status: 'Interrupted' });
        expect(interrupted).toEqual([{ type: 'turn_aborted', turn_id: 'turn-1' }]);

        const failed = converter.handleNotification('turn/completed', { turn: { id: 'turn-1' }, status: 'Failed', message: 'boom' });
        expect(failed).toEqual([{ type: 'task_failed', turn_id: 'turn-1', error: 'boom' }]);
    });

    it('accumulates agent message deltas', () => {
        const converter = new AppServerEventConverter();

        converter.handleNotification('item/agentMessage/delta', { itemId: 'msg-1', delta: 'Hello' });
        converter.handleNotification('item/agentMessage/delta', { itemId: 'msg-1', delta: ' world' });
        const completed = converter.handleNotification('item/completed', {
            item: { id: 'msg-1', type: 'agentMessage' }
        });

        expect(completed).toEqual([{ type: 'agent_message', message: 'Hello world' }]);
    });

    it('maps command execution items and output deltas', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('item/started', {
            item: { id: 'cmd-1', type: 'commandExecution', command: 'ls' }
        });
        expect(started).toEqual([{
            type: 'exec_command_begin',
            call_id: 'cmd-1',
            command: 'ls'
        }]);

        converter.handleNotification('item/commandExecution/outputDelta', { itemId: 'cmd-1', delta: 'ok' });
        const completed = converter.handleNotification('item/completed', {
            item: { id: 'cmd-1', type: 'commandExecution', exitCode: 0 }
        });

        expect(completed).toEqual([{
            type: 'exec_command_end',
            call_id: 'cmd-1',
            command: 'ls',
            output: 'ok',
            exit_code: 0
        }]);
    });

    it('maps reasoning deltas', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('item/reasoning/textDelta', { itemId: 'r1', delta: 'step' });
        expect(events).toEqual([{ type: 'agent_reasoning_delta', delta: 'step' }]);
    });

    it('maps summary reasoning deltas', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('item/reasoning/summaryTextDelta', {
            itemId: 'r1',
            delta: 'step'
        });
        expect(events).toEqual([{ type: 'agent_reasoning_delta', delta: 'step' }]);
    });

    it('maps diff updates', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('turn/diff/updated', { diff: 'diff --git a b' });
        expect(events).toEqual([{ type: 'turn_diff', unified_diff: 'diff --git a b' }]);
    });

    it('maps wrapped codex events for task lifecycle', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('codex/event/task_started', {
            id: 'turn-1',
            msg: { type: 'task_started', turn_id: 'turn-1' }
        });
        expect(started).toEqual([{ type: 'task_started', turn_id: 'turn-1' }]);

        const completed = converter.handleNotification('codex/event/task_complete', {
            id: 'turn-1',
            msg: { type: 'task_complete', turn_id: 'turn-1' }
        });
        expect(completed).toEqual([{ type: 'task_complete', turn_id: 'turn-1' }]);
    });

    it('maps wrapped codex turn_aborted events', () => {
        const converter = new AppServerEventConverter();

        const aborted = converter.handleNotification('codex/event/turn_aborted', {
            id: 'turn-1',
            msg: { type: 'turn_aborted', turn_id: 'turn-1', reason: 'interrupted' }
        });
        expect(aborted).toEqual([{ type: 'turn_aborted', turn_id: 'turn-1' }]);
    });

    it('maps wrapped codex agent message', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('codex/event/agent_message', {
            id: 'turn-1',
            msg: { type: 'agent_message', message: 'hello' }
        });
        expect(events).toEqual([{ type: 'agent_message', message: 'hello' }]);
    });

    it('ignores wrapped item lifecycle and uses wrapped agent_message as canonical output', () => {
        const converter = new AppServerEventConverter();

        converter.handleNotification('codex/event/agent_message_content_delta', {
            id: 'turn-1',
            msg: { type: 'agent_message_content_delta', item_id: 'msg-1', delta: 'Hello' }
        });
        converter.handleNotification('codex/event/agent_message_delta', {
            id: 'turn-1',
            msg: { type: 'agent_message_delta', item_id: 'msg-1', delta: ' world' }
        });
        const completed = converter.handleNotification('codex/event/item_completed', {
            id: 'turn-1',
            msg: {
                type: 'item_completed',
                item: { type: 'AgentMessage', id: 'msg-1' }
            }
        });
        expect(completed).toEqual([]);

        const wrappedMessage = converter.handleNotification('codex/event/agent_message', {
            id: 'turn-1',
            msg: { type: 'agent_message', message: 'Hello world' }
        });
        expect(wrappedMessage).toEqual([{ type: 'agent_message', message: 'Hello world' }]);
    });

    it('maps direct item content arrays when wrapped stream is absent', () => {
        const converter = new AppServerEventConverter();

        const completed = converter.handleNotification('item/completed', {
            item: {
                type: 'agentMessage',
                id: 'msg-1',
                content: [{ type: 'Text', text: 'hello' }]
            },
            turnId: 'turn-1'
        });

        expect(completed).toEqual([{ type: 'agent_message', message: 'hello' }]);
    });

    it('maps wrapped codex error event', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('codex/event/error', {
            id: 'turn-1',
            msg: { type: 'error', message: 'boom' }
        });
        expect(events).toEqual([{ type: 'task_failed', turn_id: 'turn-1', error: 'boom' }]);
    });

    it('suppresses direct duplicate events after wrapped stream is detected', () => {
        const converter = new AppServerEventConverter();

        const wrapped = converter.handleNotification('codex/event/agent_message', {
            id: 'turn-1',
            msg: { type: 'agent_message', message: 'hello' }
        });
        expect(wrapped).toEqual([{ type: 'agent_message', message: 'hello' }]);

        const directDuplicate = converter.handleNotification('item/completed', {
            item: {
                type: 'agentMessage',
                id: 'msg-1',
                content: [{ type: 'Text', text: 'hello' }]
            },
            turnId: 'turn-1'
        });
        expect(directDuplicate).toEqual([]);
    });

    it('ignores task_complete last_agent_message in wrapped mode', () => {
        const converter = new AppServerEventConverter();

        converter.handleNotification('codex/event/agent_message', {
            id: 'turn-1',
            msg: { type: 'agent_message', message: 'hello' }
        });

        const completedWithDuplicate = converter.handleNotification('codex/event/task_complete', {
            id: 'turn-1',
            msg: { type: 'task_complete', turn_id: 'turn-1', last_agent_message: 'hello' }
        });
        expect(completedWithDuplicate).toEqual([{ type: 'task_complete', turn_id: 'turn-1' }]);

        const staleFallback = converter.handleNotification('codex/event/task_complete', {
            id: 'turn-2',
            msg: { type: 'task_complete', turn_id: 'turn-2', last_agent_message: 'hi' }
        });
        expect(staleFallback).toEqual([{ type: 'task_complete', turn_id: 'turn-2' }]);
    });
});
