// Question packs. The game engine only ever reads a pack by id, so adding a
// themed pack later means adding an entry here — no engine changes.

export interface Question {
  id: string;
  prompt: string;
  choices: [string, string];
  // Short all-caps-friendly topic for the shareable result card,
  // e.g. "CLAPPING WHEN THE PLANE LANDS".
  topic: string;
}

export interface Pack {
  id: string;
  name: string;
  questions: Question[];
}

export const PACKS: Record<string, Pack> = {
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
