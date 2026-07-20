import { create } from "zustand"

import type { Prompt } from "@/types"

interface PromptState {
  prompts: Prompt[]
  currentPrompt: Prompt | null
  loading: boolean
  error: string | null
}

interface PromptActions {
  setPrompts: (prompts: Prompt[]) => void
  addPrompt: (prompt: Prompt) => void
  updatePrompt: (id: string, prompt: Partial<Prompt>) => void
  removePrompt: (id: string) => void
  setCurrentPrompt: (prompt: Prompt | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export type PromptStore = PromptState & PromptActions

const initialState: PromptState = {
  prompts: [],
  currentPrompt: null,
  loading: false,
  error: null,
}

export const usePromptStore = create<PromptStore>()((set) => ({
  ...initialState,
  setPrompts: (prompts) => set({ prompts }),
  addPrompt: (prompt) =>
    set((state) => ({ prompts: [prompt, ...state.prompts] })),
  updatePrompt: (id, prompt) =>
    set((state) => ({
      prompts: state.prompts.map((p) =>
        p.id === id ? { ...p, ...prompt } : p
      ),
      currentPrompt:
        state.currentPrompt?.id === id
          ? { ...state.currentPrompt, ...prompt }
          : state.currentPrompt,
    })),
  removePrompt: (id) =>
    set((state) => ({
      prompts: state.prompts.filter((p) => p.id !== id),
      currentPrompt:
        state.currentPrompt?.id === id ? null : state.currentPrompt,
    })),
  setCurrentPrompt: (currentPrompt) => set({ currentPrompt }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set({ ...initialState }),
}))