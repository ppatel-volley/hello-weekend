import type { Question } from "@hello-weekend/shared"

const QUESTION_BANK: Question[] = [
    {
        question: "What day comes after Friday?",
        answer: "saturday",
        keywords: ["saturday", "sat"],
    },
    {
        question: "What colour is the sky on a clear day?",
        answer: "blue",
        keywords: ["blue"],
    },
    {
        question: "How many days are in a week?",
        answer: "seven",
        keywords: ["seven", "7"],
    },
    {
        question: "What is the opposite of hot?",
        answer: "cold",
        keywords: ["cold", "freezing"],
    },
    {
        question: "What month comes after January?",
        answer: "february",
        keywords: ["february", "feb"],
    },
    {
        question: "What is 2 + 2?",
        answer: "four",
        keywords: ["four", "4"],
    },
    {
        question: "What planet do we live on?",
        answer: "earth",
        keywords: ["earth"],
    },
    {
        question: "What is the first day of the weekend?",
        answer: "saturday",
        keywords: ["saturday", "sat"],
    },
    {
        question: "How many legs does a dog have?",
        answer: "four",
        keywords: ["four", "4"],
    },
    {
        question: "What colour are bananas?",
        answer: "yellow",
        keywords: ["yellow"],
    },
]

export function getRandomQuestions(count: number): Question[] {
    const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
}
