import type { HandsFreeSpeech } from "./hands-free-session";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
    | null;
  start: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

function recognitionConstructor() {
  if (typeof window === "undefined") return null;
  const scope = window as SpeechWindow;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function browserHandsFreeAvailable(): boolean {
  return Boolean(
    recognitionConstructor() &&
    window.isSecureContext &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window,
  );
}

export function browserHandsFreeSpeech(): HandsFreeSpeech {
  return {
    listen(events) {
      const Constructor = recognitionConstructor();
      if (!Constructor) throw new Error("Speech recognition is unavailable.");
      const recognition = new Constructor();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = events.started;
      recognition.onend = events.ended;
      recognition.onerror = ({ error }) =>
        events.error(
          error === "not-allowed" || error === "service-not-allowed"
            ? "Microphone access was blocked. Check site permissions, or type your request."
            : error === "no-speech"
              ? "No speech was heard. Start listening again when ready."
              : "Speech input was interrupted. Check your connection and audio device, then restart.",
        );
      recognition.onresult = ({ results }) => {
        const text = Array.from(results)
          .filter((result) => result.isFinal)
          .map((result) => result[0].transcript)
          .join(" ");
        if (text.trim()) events.result(text);
      };
      recognition.start();
      return () => {
        recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
        recognition.abort();
      };
    },
    speak(text, done, failed) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.onend = done;
      utterance.onerror = failed;
      window.speechSynthesis.speak(utterance);
      return () => {
        utterance.onend = utterance.onerror = null;
        window.speechSynthesis.cancel();
      };
    },
  };
}
