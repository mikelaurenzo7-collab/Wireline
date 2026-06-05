  const clearThread = useCallback(async () => {
    if (isClearing) return;

    if (!confirm("Clear your Director conversation and generated artifacts? This cannot be undone.")) {
      return;
    }

    setIsClearing(true);
    try {
      const r = await authFetch("/api/director/messages", { method: "DELETE" });
      if (!r.ok) throw new Error("Clear failed");

      // Comprehensive local state reset
      setMessages([]);
      setArtifacts([]);
      setResolved({});
      setComposerAccessory(null);
      setForceDeep(false);
      setIntegrationLiveActions([]);
      setLiveSteps([]);
      setInput("");

      toastSuccess("Thread cleared", "Conversation and artifacts removed");
    } catch {
      toastError("Couldn't clear thread", "Please try again");
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, toastError, toastSuccess]);
