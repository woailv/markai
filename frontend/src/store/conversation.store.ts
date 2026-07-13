import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ConversationStore {
  activeConversationId: number | null
  setActiveConversationId: (id: number | null) => void
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set) => ({
      activeConversationId: null,
      setActiveConversationId: (id) => set({ activeConversationId: id }),
    }),
    {
      name: "prompttool-conversation",
    },
  ),
)