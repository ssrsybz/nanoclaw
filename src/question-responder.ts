/**
 * Question Responder for AskUserQuestion tool
 *
 * Manages pending questions from the agent and coordinates responses
 * between the backend (agent-runner) and frontend (WebSocket).
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';
import type { Question, QuestionAnswer, AskUserQuestionResponse } from './types.js';

// Pending question state
interface PendingQuestion {
  toolUseId: string;
  conversationId: string;
  questions: Question[];
  timestamp: number;
  resolve: (answers: Record<string, string>, annotations?: AskUserQuestionResponse['annotations']) => void;
  reject: (error: Error) => void;
}

// Global pending questions map (keyed by conversationId)
const pendingQuestions = new Map<string, PendingQuestion>();

// IPC directory for question responses
const QUESTION_IPC_DIR = path.join(DATA_DIR, 'ipc', 'questions');

/**
 * Ensure the IPC directory exists
 */
function ensureIpcDir(): void {
  if (!fs.existsSync(QUESTION_IPC_DIR)) {
    fs.mkdirSync(QUESTION_IPC_DIR, { recursive: true });
  }
}

/**
 * Register a pending question and wait for user response.
 * Called by agent-runner when ask_user_question tool is invoked.
 *
 * @param toolUseId - Unique ID for this tool use
 * @param conversationId - Conversation ID for routing
 * @param questions - Questions to ask the user
 * @param timeoutMs - Timeout in milliseconds (default 5 minutes)
 * @returns User's answers
 */
export async function waitForQuestionResponse(
  toolUseId: string,
  conversationId: string,
  questions: Question[],
  timeoutMs: number = 300000, // 5 minutes
): Promise<{ answers: Record<string, string>; annotations?: AskUserQuestionResponse['annotations'] }> {
  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeout = setTimeout(() => {
      pendingQuestions.delete(conversationId);
      reject(new Error('Question response timeout'));
    }, timeoutMs);

    // Store pending question
    pendingQuestions.set(conversationId, {
      toolUseId,
      conversationId,
      questions,
      timestamp: Date.now(),
      resolve: (answers, annotations) => {
        clearTimeout(timeout);
        pendingQuestions.delete(conversationId);
        resolve({ answers, annotations });
      },
      reject: (error) => {
        clearTimeout(timeout);
        pendingQuestions.delete(conversationId);
        reject(error);
      },
    });

    logger.info({ conversationId, toolUseId, questionCount: questions.length }, 'Waiting for question response');
  });
}

/**
 * Handle a question response from the frontend.
 * Called by channels/web.ts when a response message is received.
 *
 * @param response - The response from the frontend
 * @returns true if the response was handled, false if no pending question
 */
export function handleQuestionResponse(response: AskUserQuestionResponse): boolean {
  const pending = pendingQuestions.get(response.conversationId);

  if (!pending) {
    logger.warn({ conversationId: response.conversationId }, 'No pending question for response');
    return false;
  }

  if (pending.toolUseId !== response.toolUseId) {
    logger.warn(
      { conversationId: response.conversationId, expected: pending.toolUseId, got: response.toolUseId },
      'Tool use ID mismatch for question response',
    );
    return false;
  }

  // Handle cancellation
  if (response.cancelled) {
    pending.reject(new Error('User cancelled the question'));
    logger.info({ conversationId: response.conversationId }, 'Question cancelled by user');
    return true;
  }

  // Resolve the promise with answers
  pending.resolve(response.answers, response.annotations);
  logger.info({ conversationId: response.conversationId }, 'Question response received');

  return true;
}

/**
 * Get the pending question for a conversation.
 * Called by channels/web.ts to check if there's a question to send.
 */
export function getPendingQuestion(conversationId: string): PendingQuestion | null {
  return pendingQuestions.get(conversationId) || null;
}

/**
 * Cancel a pending question (e.g., when agent is stopped).
 */
export function cancelPendingQuestion(conversationId: string): void {
  const pending = pendingQuestions.get(conversationId);
  if (pending) {
    pending.reject(new Error('Question cancelled'));
  }
}

/**
 * Check if there's a pending question for a conversation.
 */
export function hasPendingQuestion(conversationId: string): boolean {
  return pendingQuestions.has(conversationId);
}

/**
 * Write a question response via IPC (alternative to WebSocket).
 * Useful for testing or when WebSocket is not available.
 */
export function writeQuestionResponseViaIPC(response: AskUserQuestionResponse): void {
  ensureIpcDir();
  const filePath = path.join(QUESTION_IPC_DIR, `${response.conversationId}-${response.toolUseId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(response, null, 2));
  logger.debug({ filePath }, 'Wrote question response via IPC');
}

/**
 * Read and process pending IPC responses.
 * Called periodically to check for responses written via IPC.
 */
export function processIPCResponses(): void {
  ensureIpcDir();

  try {
    const files = fs.readdirSync(QUESTION_IPC_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = path.join(QUESTION_IPC_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AskUserQuestionResponse;

        if (data.type === 'ask_user_question_response') {
          handleQuestionResponse(data);
        }

        // Remove the file after processing
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.warn({ file, err }, 'Failed to process IPC response file');
      }
    }
  } catch (err) {
    logger.debug({ err }, 'Error checking IPC response directory');
  }
}
