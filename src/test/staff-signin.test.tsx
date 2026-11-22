import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { sermonService, StaffAuthError, type StaffSession } from "@/lib/sermon/service";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const signedOut: StaffSession = { status: "signed-out", emailLinks: true };

function renderGate() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminGate>{(session) => <AdminTopBar {...session} />}</AdminGate>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

it("shows loading and a disconnected screen without credential fields", async () => {
  vi.spyOn(sermonService, "session").mockResolvedValue({ status: "not-connected" });
  renderGate();
  expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  expect(
    await screen.findByRole("heading", { name: "Staff sign-in isn’t connected yet" }),
  ).toBeVisible();
  expect(screen.queryByLabelText("Email")).toBeNull();
});

it("shows and hides the password and focuses an authentication error", async () => {
  vi.spyOn(sermonService, "session").mockResolvedValue(signedOut);
  const login = vi
    .spyOn(sermonService, "login")
    .mockRejectedValue(new StaffAuthError(401, "The email or password is incorrect."));
  renderGate();
  const email = await screen.findByLabelText("Email");
  const password = screen.getByLabelText("Password", { exact: true });
  expect(email).toHaveAttribute("autocomplete", "email");
  expect(password).toHaveAttribute("autocomplete", "current-password");
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(password).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(password).toHaveAttribute("type", "password");
  fireEvent.change(email, { target: { value: "editor@example.com" } });
  fireEvent.change(password, { target: { value: "fictional-wrong-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("The email or password is incorrect.");
  expect(error).toHaveFocus();
  expect(login).toHaveBeenCalledWith("editor@example.com", "fictional-wrong-password");
});

it("focuses the neutral confirmation after requesting an email link", async () => {
  vi.spyOn(sermonService, "session").mockResolvedValue(signedOut);
  const message = "If this address is eligible, a sign-in link will arrive shortly.";
  const requestLink = vi.spyOn(sermonService, "requestSignInLink").mockResolvedValue({ message });
  renderGate();
  fireEvent.click(await screen.findByRole("button", { name: "Email me a sign-in link" }));
  const email = screen.getByLabelText("Email");
  expect(email).toHaveFocus();
  expect(screen.queryByLabelText("Password")).toBeNull();
  fireEvent.change(email, { target: { value: "volunteer@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));
  expect(await screen.findByRole("heading", { name: "Check your email" })).toBeVisible();
  const confirmation = screen.getByRole("status");
  expect(confirmation).toHaveTextContent(message);
  expect(confirmation).toHaveFocus();
  expect(requestLink).toHaveBeenCalledWith("volunteer@example.com");
});

it("shows a sign-out action for a platform session without Notes access", async () => {
  const session = vi
    .spyOn(sermonService, "session")
    .mockResolvedValueOnce({ status: "no-access" })
    .mockResolvedValue(signedOut);
  const logout = vi.spyOn(sermonService, "logout").mockResolvedValue();
  renderGate();
  expect(
    await screen.findByText(
      "Your RFC account doesn’t have Notes editor access. Ask an administrator.",
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(
    await screen.findByRole("heading", { name: "Sign in with your RFC account" }),
  ).toBeVisible();
  expect(logout).toHaveBeenCalledOnce();
  expect(session).toHaveBeenCalledTimes(2);
});

it("shows the RFC display name and a sign-out control in the signed-in top bar", async () => {
  vi.spyOn(sermonService, "session").mockResolvedValue({
    status: "signed-in",
    identity: { displayName: "Demo Editor", permissions: ["notes.access", "notes.sermons.view"] },
  });
  renderGate();
  expect(await screen.findByText("Demo Editor")).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
});
