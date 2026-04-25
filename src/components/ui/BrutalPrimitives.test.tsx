import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BrutalButton } from "./BrutalButton";
import { BrutalCard } from "./BrutalCard";
import { BrutalInput } from "./BrutalInput";

describe("BrutalCard", () => {
  it("renders children and applies the brutal border", () => {
    render(<BrutalCard data-testid="card">Hello</BrutalCard>);
    const card = screen.getByTestId("card");
    expect(card).toHaveTextContent("Hello");
    expect(card.className).toContain("border-2");
    expect(card.className).toContain("border-ink");
  });

  it("respects the flush prop by removing built-in padding", () => {
    render(
      <BrutalCard data-testid="card" flush>
        x
      </BrutalCard>
    );
    expect(screen.getByTestId("card").className).toContain("p-0");
  });
});

describe("BrutalButton", () => {
  it("invokes onClick and renders icons", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BrutalButton onClick={onClick} leadingIcon={<span data-testid="icon">★</span>}>
        Submit
      </BrutalButton>
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BrutalButton onClick={onClick} disabled>
        Submit
      </BrutalButton>
    );
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("BrutalInput", () => {
  it("links the label to the input via htmlFor/id", () => {
    render(<BrutalInput name="email" label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toBeInTheDocument();
    expect(input.id).toBe("field-email");
  });

  it("surfaces errors with role=alert and aria-invalid", () => {
    render(<BrutalInput name="email" label="Email" error="Required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
