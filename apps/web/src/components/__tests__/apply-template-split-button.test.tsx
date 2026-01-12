import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/utils";
import enMessages from "@/i18n/messages/en.json";
import { ApplyTemplateSplitButton } from "../apply-template-split-button";

const setup = (overrides: Partial<Parameters<typeof ApplyTemplateSplitButton>[0]> = {}) => {
  const props = {
    onAddToPanel: vi.fn(),
    onReplacePanel: vi.fn(),
    onViewDetails: vi.fn(),
    ...overrides,
  };

  renderWithIntl(<ApplyTemplateSplitButton {...props} />);

  return props;
};

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole("button", { name: enMessages.collections.applyMenu }),
  );
};

describe("ApplyTemplateSplitButton", () => {
  it("uses hit target sizes for buttons and menu items", async () => {
    const user = userEvent.setup();
    setup();

    expect(
      screen.getByRole("button", { name: enMessages.collections.apply }),
    ).toHaveClass("h-10");
    expect(
      screen.getByRole("button", { name: enMessages.collections.applyMenu }),
    ).toHaveClass("h-10");

    await openMenu(user);
    expect(
      screen.getByRole("menuitem", { name: enMessages.collections.addToPanel }),
    ).toHaveClass("min-h-9");
  });

  it("calls onAddToPanel when the Apply button is clicked", async () => {
    const user = userEvent.setup();
    const { onAddToPanel } = setup();

    await user.click(
      screen.getByRole("button", { name: enMessages.collections.apply }),
    );

    expect(onAddToPanel).toHaveBeenCalledTimes(1);
  });

  it("calls onAddToPanel from the dropdown menu", async () => {
    const user = userEvent.setup();
    const { onAddToPanel } = setup();

    await openMenu(user);
    await user.click(
      screen.getByRole("menuitem", { name: enMessages.collections.addToPanel }),
    );

    expect(onAddToPanel).toHaveBeenCalledTimes(1);
  });

  it("calls onReplacePanel from the dropdown menu", async () => {
    const user = userEvent.setup();
    const { onReplacePanel } = setup();

    await openMenu(user);
    await user.click(
      screen.getByRole("menuitem", { name: enMessages.collections.replacePanel }),
    );

    expect(onReplacePanel).toHaveBeenCalledTimes(1);
  });

  it("calls onViewDetails from the dropdown menu", async () => {
    const user = userEvent.setup();
    const { onViewDetails } = setup();

    await openMenu(user);
    await user.click(
      screen.getByRole("menuitem", { name: enMessages.collections.viewDetails }),
    );

    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it("shows admin actions and calls their handlers", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    setup({ isAdmin: true, onEdit, onDelete });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: enMessages.common.edit }));
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: enMessages.common.delete }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard navigation inside the menu", async () => {
    const user = userEvent.setup();
    const { onReplacePanel } = setup();

    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onReplacePanel).toHaveBeenCalledTimes(1);
  });
});
