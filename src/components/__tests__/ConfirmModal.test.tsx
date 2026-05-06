// ConfirmModal tests — guards every destructive action in the app
// (delete agent, release phone number, cancel campaign). A regression
// here either fires actions without confirmation or blocks legitimate ones.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmModal from "../ConfirmModal";

describe("ConfirmModal", () => {
  const baseProps = {
    title: "Delete agent",
    message: "This will permanently remove the agent and all training data.",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders nothing when open=false", () => {
    const { container } = render(<ConfirmModal {...baseProps} open={false} />);
    // AnimatePresence still mounts a wrapper, but no title text should appear.
    expect(container.querySelector("h3")).toBeNull();
  });

  it("renders title and message when open=true", () => {
    render(<ConfirmModal {...baseProps} open={true} />);
    expect(screen.getByText("Delete agent")).toBeInTheDocument();
    expect(screen.getByText(/permanently remove the agent/i)).toBeInTheDocument();
  });

  it("uses default labels when none are provided", () => {
    render(<ConfirmModal {...baseProps} open={true} />);
    expect(screen.getByRole("button", { name: /^Confirm$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument();
  });

  it("uses custom labels when provided", () => {
    render(
      <ConfirmModal
        {...baseProps}
        open={true}
        confirmLabel="Yes, delete"
        cancelLabel="Keep agent"
      />,
    );
    expect(screen.getByRole("button", { name: /Yes, delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Keep agent/i })).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...baseProps} open={true} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...baseProps} open={true} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onConfirm when only Cancel is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...baseProps} open={true} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking the backdrop triggers cancel (not confirm)", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmModal {...baseProps} open={true} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    // The backdrop is the absolutely-positioned overlay; click any element
    // with the backdrop's onClick wired to onCancel.
    const backdrop = container.querySelector('[class*="bg-black"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
