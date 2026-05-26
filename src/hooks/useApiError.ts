import { useToast } from "../contexts/ToastContext";
import { captureException } from "../lib/sentry";

export interface ApiErrorResponse {
  error: string;
  code?: string;
  issues?: Array<{ path: string; message: string }>;
  requestId?: string;
}

export function useApiError() {
  const { toast } = useToast();

  const handleApiError = async (
    response: Response,
    fallbackMessage = "An unexpected error occurred",
  ) => {
    try {
      const data = (await response.json()) as ApiErrorResponse;

      // If we have validation issues from Zod, format them nicely
      if (data.code === "VALIDATION_FAILED" && data.issues?.length) {
        const issueList = data.issues.map((i) => i.message).join(", ");
        toast({
          type: "error",
          title: "Invalid input",
          message: issueList,
        });
        return data;
      }

      toast({
        type: "error",
        title: "Error",
        message: data.error || fallbackMessage,
      });
      return data;
    } catch (e) {
      // Failed to parse JSON error response
      captureException(e);
      toast({
        type: "error",
        title: "Error",
        message: fallbackMessage,
      });
      return { error: fallbackMessage };
    }
  };

  const handleCatchError = (error: unknown, fallbackMessage = "An unexpected error occurred") => {
    captureException(error);
    const message = error instanceof Error ? error.message : fallbackMessage;
    toast({
      type: "error",
      title: "Error",
      message: message,
    });
  };

  return { handleApiError, handleCatchError };
}
