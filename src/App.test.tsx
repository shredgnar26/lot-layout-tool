import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { loadProject, saveProject } from "./planner/storage";
jest.mock("./planner/storage", () => ({
  loadProject: jest.fn().mockResolvedValue(null),
  saveProject: jest.fn().mockResolvedValue(undefined),
  validateProject: jest.fn((x) => x),
}));
jest.mock("./planner/MapPicker", () => () => null);
beforeEach(() => {
  (loadProject as jest.Mock).mockResolvedValue(null);
  (saveProject as jest.Mock).mockResolvedValue(undefined);
});
test("sample workflow generates, splits, undoes, and autosaves a full project", async () => {
  render(<App />);
  const sample = await screen.findByRole("button", {
    name: "Try a sample property",
  });
  await waitFor(() => expect(sample).toBeEnabled());
  fireEvent.click(sample);
  fireEvent.click(screen.getByRole("button", { name: "2. Lots" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate lots" }));
  await screen.findByText(/proposed lots. Review amber/);
  const lotButton = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.startsWith("Lot 1"));
  expect(lotButton).toBeTruthy();
  fireEvent.click(lotButton!);
  fireEvent.click(screen.getByRole("button", { name: "Split ↔" }));
  expect(
    screen.getByText("Lot 1A", { selector: "strong" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "↶ Undo" }));
  expect(
    screen.queryByText("Lot 1A", { selector: "strong" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(saveProject).toHaveBeenCalled());
  expect(loadProject).toHaveBeenCalled();
});
