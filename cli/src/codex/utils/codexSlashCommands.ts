export function parseCodexNewCommand(message: string): { isNew: boolean; remainder: string } {
    const withoutLeadingWhitespace = message.replace(/^\s+/, '');
    if (!withoutLeadingWhitespace.startsWith('/new')) {
        return { isNew: false, remainder: '' };
    }

    const after = withoutLeadingWhitespace.slice('/new'.length);
    if (after.length > 0 && !/^\s/.test(after)) {
        // Avoid matching "/newer", "/new123", etc.
        return { isNew: false, remainder: '' };
    }

    return { isNew: true, remainder: after.trim() };
}

