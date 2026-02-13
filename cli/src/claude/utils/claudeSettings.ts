/**
 * Utilities for reading Claude + HAPI settings that affect Claude prompt injection.
 *
 * Today: commit message credits ("via HAPI" + "Co-Authored-By: HAPI ...").
 *
 * Precedence:
 * 1) HAPI global settings (~/.hapi/settings.json): includeCoAuthoredBy
 * 2) Claude settings (~/.claude/settings.json): includeCoAuthoredBy (legacy)
 * 3) Default: true (enabled)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';

export interface ClaudeSettings {
  includeCoAuthoredBy?: boolean;
  [key: string]: any;
}

export interface HapiSettings {
  includeCoAuthoredBy?: boolean;
  [key: string]: any;
}

/**
 * Get the path to Claude's settings.json file
 */
function getClaudeSettingsPath(): string {
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return join(claudeConfigDir, 'settings.json');
}

/**
 * Get the path to HAPI's global settings.json file
 */
function getHapiSettingsPath(): string {
  const hapiHomeDir = process.env.HAPI_HOME
    ? process.env.HAPI_HOME.replace(/^~/, homedir())
    : join(homedir(), '.hapi');
  return join(hapiHomeDir, 'settings.json');
}

/**
 * Read Claude's settings.json file from the default location
 * 
 * @returns Claude settings object or null if file doesn't exist or can't be read
 */
export function readClaudeSettings(): ClaudeSettings | null {
  try {
    const settingsPath = getClaudeSettingsPath();
    
    if (!existsSync(settingsPath)) {
      logger.debug(`[ClaudeSettings] No Claude settings file found at ${settingsPath}`);
      return null;
    }
    
    const settingsContent = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent) as ClaudeSettings;
    
    logger.debug(`[ClaudeSettings] Successfully read Claude settings from ${settingsPath}`);
    logger.debug(`[ClaudeSettings] includeCoAuthoredBy: ${settings.includeCoAuthoredBy}`);
    
    return settings;
  } catch (error) {
    logger.debug(`[ClaudeSettings] Error reading Claude settings: ${error}`);
    return null;
  }
}

/**
 * Read HAPI's settings.json file from the default location
 *
 * @returns HAPI settings object or null if file doesn't exist or can't be read
 */
export function readHapiSettings(): HapiSettings | null {
  try {
    const settingsPath = getHapiSettingsPath();

    if (!existsSync(settingsPath)) {
      logger.debug(`[HapiSettings] No HAPI settings file found at ${settingsPath}`);
      return null;
    }

    const settingsContent = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent) as HapiSettings;

    logger.debug(`[HapiSettings] Successfully read HAPI settings from ${settingsPath}`);
    logger.debug(`[HapiSettings] includeCoAuthoredBy: ${settings.includeCoAuthoredBy}`);

    return settings;
  } catch (error) {
    logger.debug(`[HapiSettings] Error reading HAPI settings: ${error}`);
    return null;
  }
}

/**
 * Check if Co-Authored-By lines should be included in commit messages
 * based on HAPI global settings (preferred) or Claude's settings (legacy).
 * 
 * @returns true if Co-Authored-By should be included, false otherwise
 */
export function shouldIncludeCoAuthoredBy(): boolean {
  const hapiSettings = readHapiSettings();
  if (hapiSettings && hapiSettings.includeCoAuthoredBy !== undefined) {
    if (typeof hapiSettings.includeCoAuthoredBy !== 'boolean') {
      logger.debug(
        `[HapiSettings] includeCoAuthoredBy must be a boolean, got: ${typeof hapiSettings.includeCoAuthoredBy}`
      );
    } else {
      return hapiSettings.includeCoAuthoredBy;
    }
  }

  const claudeSettings = readClaudeSettings();

  // If no settings file or includeCoAuthoredBy is not explicitly set,
  // default to true to maintain backward compatibility
  if (!claudeSettings || claudeSettings.includeCoAuthoredBy === undefined) {
    return true;
  }

  if (typeof claudeSettings.includeCoAuthoredBy !== 'boolean') {
    logger.debug(
      `[ClaudeSettings] includeCoAuthoredBy must be a boolean, got: ${typeof claudeSettings.includeCoAuthoredBy}`
    );
    return true;
  }

  return claudeSettings.includeCoAuthoredBy;
}
