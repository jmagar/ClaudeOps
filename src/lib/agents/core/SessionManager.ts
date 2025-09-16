import { writeFile, readFile, mkdir, stat, readdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { createId } from '@paralleldrive/cuid2';

import type {
  SessionState,
  SessionCheckpoint,
  BaseAgentOptions,
  ProgressUpdate,
  LogCallback
} from './types';

import type { SDKMessage } from '@anthropic-ai/claude-code';

/**
 * Manages agent session persistence, checkpointing, and resumption
 */
export class SessionManager {
  private sessionDir: string;
  private log: LogCallback;
  private currentSession: SessionState | null = null;
  private checkpointInterval: number;

  constructor(
    sessionDir: string = './sessions',
    log?: LogCallback,
    checkpointInterval: number = 30000 // 30 seconds
  ) {
    this.sessionDir = sessionDir;
    this.log = log || (() => {});
    this.checkpointInterval = checkpointInterval;
  }

  /**
   * Initialize session directory
   */
  async initialize(): Promise<void> {
    try {
      await mkdir(this.sessionDir, { recursive: true });
      this.log('📁 Session directory initialized', 'debug');
    } catch (error) {
      this.log(`❌ Failed to initialize session directory: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Create a new session
   */
  async createSession(
    agentType: string,
    executionId: string,
    options: BaseAgentOptions,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const sessionId = options.sessionId || createId();
    const now = new Date().toISOString();

    const session: SessionState = {
      sessionId,
      agentType,
      executionId,
      startTime: now,
      lastUpdate: now,
      options,
      progress: {
        stage: 'starting',
        message: 'Session created',
        currentTurn: 0,
        maxTurns: options.maxTurns || 50,
        toolsUsed: [],
        cost: 0
      },
      messages: [],
      checkpoints: [],
      metadata
    };

    await this.saveSession(session);
    this.currentSession = session;

    this.log(`📋 Created session ${sessionId} for ${agentType}`, 'info');
    return sessionId;
  }

  /**
   * Load an existing session
   */
  async loadSession(sessionId: string): Promise<SessionState | null> {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      const data = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(data) as SessionState;
      
      this.currentSession = session;
      this.log(`📋 Loaded session ${sessionId}`, 'info');
      return session;
    } catch (error) {
      this.log(`❌ Failed to load session ${sessionId}: ${error}`, 'error');
      return null;
    }
  }

  /**
   * Save session state to disk
   */
  async saveSession(session: SessionState): Promise<void> {
    try {
      await this.initialize(); // Ensure directory exists
      
      const sessionPath = this.getSessionPath(session.sessionId);
      const data = JSON.stringify(session, null, 2);
      
      await writeFile(sessionPath, data, 'utf-8');
      this.log(`💾 Saved session ${session.sessionId}`, 'debug');
    } catch (error) {
      this.log(`❌ Failed to save session ${session.sessionId}: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Update current session with new data
   */
  async updateSession(updates: Partial<SessionState>): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session to update');
    }

    // Merge updates
    this.currentSession = {
      ...this.currentSession,
      ...updates,
      lastUpdate: new Date().toISOString()
    };

    await this.saveSession(this.currentSession);
  }

  /**
   * Add a checkpoint to the current session
   */
  async addCheckpoint(
    turn: number,
    cost: number,
    progress: ProgressUpdate,
    lastTool?: string
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session for checkpoint');
    }

    const checkpoint: SessionCheckpoint = {
      timestamp: new Date().toISOString(),
      turn,
      cost,
      lastTool,
      progress: { ...progress },
      canResume: true
    };

    this.currentSession.checkpoints.push(checkpoint);
    this.currentSession.progress = { ...progress };
    
    await this.saveSession(this.currentSession);
    this.log(`📍 Added checkpoint at turn ${turn}`, 'debug');
  }

  /**
   * Add a message to the current session
   */
  async addMessage(message: SDKMessage): Promise<void> {
    if (!this.currentSession) {
      return; // No session to update
    }

    this.currentSession.messages.push(message);
    
    // Auto-checkpoint at intervals if we have many messages
    if (this.currentSession.messages.length % 10 === 0) {
      const lastCheckpoint = this.currentSession.checkpoints.slice(-1)[0];
      const timeSinceLastCheckpoint = lastCheckpoint 
        ? Date.now() - new Date(lastCheckpoint.timestamp).getTime()
        : this.checkpointInterval + 1;

      if (timeSinceLastCheckpoint > this.checkpointInterval) {
        await this.addCheckpoint(
          this.currentSession.progress.currentTurn || 0,
          this.currentSession.progress.cost || 0,
          this.currentSession.progress
        );
      }
    }
  }

  /**
   * Resume a session from the latest checkpoint
   */
  async resumeSession(sessionId: string): Promise<{
    session: SessionState;
    resumeFromCheckpoint: SessionCheckpoint | null;
    messages: SDKMessage[];
  }> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Find the latest resumable checkpoint
    const resumableCheckpoints = session.checkpoints.filter(cp => cp.canResume);
    const latestCheckpoint = resumableCheckpoints.slice(-1)[0] || null;

    // Filter messages up to the checkpoint
    let messagesToResume = session.messages;
    if (latestCheckpoint) {
      const checkpointTime = new Date(latestCheckpoint.timestamp).getTime();
      messagesToResume = session.messages.filter(msg => {
        // This is a simplified approach - in practice you'd need better message timestamping
        return true; // For now, include all messages
      });
    }

    this.log(`🔄 Resuming session ${sessionId} from ${latestCheckpoint ? 'checkpoint' : 'beginning'}`, 'info');

    return {
      session,
      resumeFromCheckpoint: latestCheckpoint,
      messages: messagesToResume
    };
  }

  /**
   * List all sessions with metadata
   */
  async listSessions(): Promise<SessionSummary[]> {
    try {
      await this.initialize();
      const files = await readdir(this.sessionDir);
      const sessionFiles = files.filter(f => f.endsWith('.json'));
      
      const sessions: SessionSummary[] = [];
      
      for (const file of sessionFiles) {
        try {
          const sessionPath = join(this.sessionDir, file);
          const stats = await stat(sessionPath);
          const data = await readFile(sessionPath, 'utf-8');
          const session = JSON.parse(data) as SessionState;
          
          sessions.push({
            sessionId: session.sessionId,
            agentType: session.agentType,
            executionId: session.executionId,
            startTime: session.startTime,
            lastUpdate: session.lastUpdate,
            progress: session.progress,
            checkpointCount: session.checkpoints.length,
            messageCount: session.messages.length,
            fileSize: stats.size,
            canResume: session.checkpoints.some(cp => cp.canResume)
          });
        } catch (error) {
          this.log(`⚠️ Failed to parse session file ${file}: ${error}`, 'warn');
        }
      }
      
      // Sort by last update time (newest first)
      sessions.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
      
      return sessions;
    } catch (error) {
      this.log(`❌ Failed to list sessions: ${error}`, 'error');
      return [];
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      await unlink(sessionPath);
      
      if (this.currentSession?.sessionId === sessionId) {
        this.currentSession = null;
      }
      
      this.log(`🗑️ Deleted session ${sessionId}`, 'info');
    } catch (error) {
      this.log(`❌ Failed to delete session ${sessionId}: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Clean up old sessions
   */
  async cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const sessions = await this.listSessions();
      const now = Date.now();
      let deleted = 0;
      
      for (const session of sessions) {
        const sessionAge = now - new Date(session.lastUpdate).getTime();
        if (sessionAge > maxAge) {
          await this.deleteSession(session.sessionId);
          deleted++;
        }
      }
      
      this.log(`🧹 Cleaned up ${deleted} old sessions`, 'info');
      return deleted;
    } catch (error) {
      this.log(`❌ Failed to cleanup sessions: ${error}`, 'error');
      return 0;
    }
  }

  /**
   * Get statistics about sessions
   */
  async getStatistics(): Promise<SessionStatistics> {
    const sessions = await this.listSessions();
    
    const stats: SessionStatistics = {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.canResume).length,
      agentTypeBreakdown: {},
      averageMessageCount: 0,
      averageCheckpoints: 0,
      oldestSession: null,
      newestSession: null,
      totalDiskUsage: 0
    };

    if (sessions.length === 0) {
      return stats;
    }

    // Calculate breakdown by agent type
    for (const session of sessions) {
      stats.agentTypeBreakdown[session.agentType] = 
        (stats.agentTypeBreakdown[session.agentType] || 0) + 1;
      stats.totalDiskUsage += session.fileSize;
    }

    // Calculate averages
    stats.averageMessageCount = sessions.reduce((sum, s) => sum + s.messageCount, 0) / sessions.length;
    stats.averageCheckpoints = sessions.reduce((sum, s) => sum + s.checkpointCount, 0) / sessions.length;

    // Find oldest and newest
    stats.oldestSession = sessions.reduce((oldest, current) => 
      new Date(current.startTime).getTime() < new Date(oldest.startTime).getTime() ? current : oldest
    );
    
    stats.newestSession = sessions.reduce((newest, current) => 
      new Date(current.startTime).getTime() > new Date(newest.startTime).getTime() ? current : newest
    );

    return stats;
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionState | null {
    return this.currentSession;
  }

  /**
   * Get session file path
   */
  private getSessionPath(sessionId: string): string {
    return join(this.sessionDir, `${sessionId}.json`);
  }
}

// Session-related interfaces
interface SessionSummary {
  sessionId: string;
  agentType: string;
  executionId: string;
  startTime: string;
  lastUpdate: string;
  progress: ProgressUpdate;
  checkpointCount: number;
  messageCount: number;
  fileSize: number;
  canResume: boolean;
}

interface SessionStatistics {
  totalSessions: number;
  activeSessions: number;
  agentTypeBreakdown: Record<string, number>;
  averageMessageCount: number;
  averageCheckpoints: number;
  oldestSession: SessionSummary | null;
  newestSession: SessionSummary | null;
  totalDiskUsage: number;
}