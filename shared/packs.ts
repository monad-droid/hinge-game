// Question packs. Players never see or choose packs — every new game uses
// CURRENT_PACK_ID (shared/config.ts), so there is exactly one live question
// list. Old pack entries stay in code only so games created against them
// keep rendering correctly: answers are stored as choice indices, so a
// pack's questions must never change once games exist for it. To update
// the questions, add a new pack here and point CURRENT_PACK_ID at it.

export interface Question {
  id: string;
  prompt: string;
  choices: [string, string];
  // Short all-caps-friendly topic for the shareable result card,
  // e.g. "MORNING ALARM STRATEGY".
  topic: string;
}

export interface Pack {
  id: string;
  name: string;
  questions: Question[];
}

export const PACKS: Record<string, Pack> = {
  // The live pack — what every new game is created from.
  "original-v2": {
    id: "original-v2",
    name: "Original v2",
    questions: [
      {
        id: "fries-milkshake",
        topic: "Fries in a milkshake",
        prompt: "Fries dipped in a milkshake.",
        choices: ["Elite combination", "Food crime"],
      },
      {
        id: "voice-note",
        topic: "Three-minute voice notes",
        prompt: "Someone sends you a 3-minute voice note.",
        choices: ["Love it", "Call me at that point"],
      },
      {
        id: "alarms",
        topic: "Morning alarm strategy",
        prompt: "How many alarms are acceptable in the morning?",
        choices: ["One. Get up.", "However many it takes"],
      },
      {
        id: "sleep",
        topic: "Sleep requirements",
        prompt: "How much sleep do you need to be functional the next day?",
        choices: ["6–7 hours", "8+ or don't speak to me"],
      },
      {
        id: "empty-day",
        topic: "A completely empty day",
        prompt: "You wake up with absolutely nothing to do.",
        choices: ["Make plans immediately", "Protect the empty day"],
      },
      {
        id: "airport",
        topic: "Airport arrival times",
        prompt: "You have a 6 a.m. flight. When are you getting to the airport?",
        choices: ["2+ hours early", "Under an hour is plenty"],
      },
      {
        id: "eating-out",
        topic: "How often to eat out",
        prompt: "Eating out in a normal week:",
        choices: ["Once is enough", "As often as possible"],
      },
    ],
  },

  // Frozen. Not used for new games — kept only so pre-existing game links
  // render the questions their answers were actually given to.
  original: {
    id: "original",
    name: "Original",
    questions: [
      {
        id: "fries-milkshake",
        topic: "Fries in a milkshake",
        prompt: "Fries dipped in a milkshake.",
        choices: ["Elite combination", "Food crime"],
      },
      {
        id: "voice-note",
        topic: "Three-minute voice notes",
        prompt: "Someone sends you a 3-minute voice note.",
        choices: ["Love it", "Call me at that point"],
      },
      {
        id: "rewatch",
        topic: "Rewatching the same show",
        prompt: "You've seen your favorite show five times already.",
        choices: ["Run it back", "Please watch something new"],
      },
      {
        id: "birthday",
        topic: "Birthday duration",
        prompt: "How long does your birthday last?",
        choices: ["One day", "Birthday week"],
      },
      {
        id: "empty-day",
        topic: "A completely empty day",
        prompt: "You wake up with absolutely nothing to do.",
        choices: ["Make plans immediately", "Protect the empty day"],
      },
      {
        id: "airport",
        topic: "Airport arrival times",
        prompt: "You have a 6 a.m. flight. When are you getting to the airport?",
        choices: ["2+ hours early", "Under an hour is plenty"],
      },
      {
        id: "clapping",
        topic: "Clapping when the plane lands",
        prompt: "The plane lands safely. Are we clapping?",
        choices: ["👏 Obviously", "We are adults"],
      },
    ],
  },
};

export function getPack(packId: string): Pack | undefined {
  return PACKS[packId];
}
