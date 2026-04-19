/**
 * harnessStore — Renderer process Zustand store for Harness state
 *
 * Manages:
 * - Current harness execution mode
 * - Evaluation reports indexed by message ID
 * - Degradation warnings
 * - Evaluation drawer visibility
 * - Resumeable tasks (TASK021)
 * - Guardrail notifications (TASK021)
 *
 * Associates with aiChatStore via message ID (does not modify ChatMessage type).
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  HarnessMode,
  EvaluationReport,
  DegradationWarning,
  TaskStateSummary,
  GuardrailNotificationData,
} from '../../shared/types'

interface HarnessState {
  currentMode: HarnessMode
  /** Evaluation reports indexed by message ID. Uses Record instead of Map for devtools serialization. */
  activeEvaluations: Record<string, EvaluationReport[]>
  degradationWarnings: DegradationWarning[]
  showEvaluationDrawer: boolean

  // === TASK021 state ===
  /** Resumeable tasks detected on startup */
  resumeableTasks: TaskStateSummary[]
  /** Whether resume dialog is visible */
  showResumeDialog: boolean
  /** Active guardrail notifications (toast queue) */
  guardrailNotifications: GuardrailNotificationData[]
}

interface HarnessActions {
  setMode: (mode: HarnessMode) => void
  setEvaluations: (msgId: string, reports: EvaluationReport[]) => void
  getEvaluations: (msgId: string) => EvaluationReport[]
  pushWarning: (warning: DegradationWarning) => void
  dismissWarning: (id: string) => void
  toggleEvaluationDrawer: () => void
  reset: () => void

  // === TASK021 actions ===
  /** Set resumeable tasks list (called from IPC event) */
  setResumeableTasks: (tasks: TaskStateSummary[]) => void
  /** Toggle resume dialog visibility */
  toggleResumeDialog: () => void
  /** Add a guardrail notification to the queue */
  addGuardrailNotification: (notification: GuardrailNotificationData) => void
  /** Dismiss a guardrail notification by ID */
  dismissGuardrailNotification: (id: string) => void
}

export type HarnessStore = HarnessState & HarnessActions

const initialState: HarnessState = {
  currentMode: 'dual',
  activeEvaluations: {},
  degradationWarnings: [],
  showEvaluationDrawer: false,
  resumeableTasks: [],
  showResumeDialog: false,
  guardrailNotifications: [],
}

export const useHarnessStore = create<HarnessStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setMode: (mode) => set({ currentMode: mode }, false, 'harness/setMode'),

      setEvaluations: (msgId, reports) =>
        set(
          (state) => ({
            activeEvaluations: { ...state.activeEvaluations, [msgId]: reports },
          }),
          false,
          'harness/setEvaluations'
        ),

      getEvaluations: (msgId) => get().activeEvaluations[msgId] ?? [],

      pushWarning: (warning) =>
        set(
          (state) => ({
            degradationWarnings: [...state.degradationWarnings, warning],
          }),
          false,
          'harness/pushWarning'
        ),

      dismissWarning: (id) =>
        set(
          (state) => ({
            degradationWarnings: state.degradationWarnings.filter((w) => w.id !== id),
          }),
          false,
          'harness/dismissWarning'
        ),

      toggleEvaluationDrawer: () =>
        set(
          (state) => ({
            showEvaluationDrawer: !state.showEvaluationDrawer,
          }),
          false,
          'harness/toggleEvaluationDrawer'
        ),

      reset: () =>
        set(
          {
            currentMode: 'dual',
            activeEvaluations: {},
            degradationWarnings: [],
            showEvaluationDrawer: false,
            resumeableTasks: [],
            showResumeDialog: false,
            guardrailNotifications: [],
          },
          false,
          'harness/reset'
        ),

      // === TASK021 actions ===

      setResumeableTasks: (tasks) =>
        set(
          {
            resumeableTasks: tasks,
            showResumeDialog: tasks.length > 0,
          },
          false,
          'harness/setResumeableTasks'
        ),

      toggleResumeDialog: () =>
        set(
          (state) => ({
            showResumeDialog: !state.showResumeDialog,
          }),
          false,
          'harness/toggleResumeDialog'
        ),

      addGuardrailNotification: (notification) =>
        set(
          (state) => ({
            guardrailNotifications: [...state.guardrailNotifications, notification],
          }),
          false,
          'harness/addGuardrailNotification'
        ),

      dismissGuardrailNotification: (id) =>
        set(
          (state) => ({
            guardrailNotifications: state.guardrailNotifications.filter((n) => n.id !== id),
          }),
          false,
          'harness/dismissGuardrailNotification'
        ),
    }),
    { name: 'HarnessStore' }
  )
)

// Primitive selectors (Object.is comparison)
export const selectCurrentMode = (state: HarnessStore) => state.currentMode
export const selectDegradationWarnings = (state: HarnessStore) => state.degradationWarnings
export const selectShowEvaluationDrawer = (state: HarnessStore) => state.showEvaluationDrawer
export const selectShowResumeDialog = (state: HarnessStore) => state.showResumeDialog
export const selectGuardrailCount = (state: HarnessStore) => state.guardrailNotifications.length

// Array selectors (need useShallow when consuming)
export const selectResumeableTasks = (state: HarnessStore) => state.resumeableTasks
export const selectGuardrailNotifications = (state: HarnessStore) => state.guardrailNotifications
