import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Switch } from "../switch";

describe("Switch", () => {
  it("toggles with mouse and keyboard", async () => {
    const user = userEvent.setup();

    function ControlledSwitch() {
      const [checked, setChecked] = useState(false);
      return (
        <Switch
          aria-label="Show inactive"
          checked={checked}
          onCheckedChange={setChecked}
        />
      );
    }

    render(<ControlledSwitch />);

    const toggle = screen.getByRole("switch", { name: "Show inactive" });
    expect(toggle).toHaveClass("h-9", "w-14");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    toggle.focus();
    await user.keyboard("{Space}");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("moves the thumb when toggled", async () => {
    const user = userEvent.setup();

    function ControlledSwitch() {
      const [checked, setChecked] = useState(false);
      return (
        <Switch
          aria-label="Show inactive"
          checked={checked}
          onCheckedChange={setChecked}
        />
      );
    }

    render(<ControlledSwitch />);

    const toggle = screen.getByRole("switch", { name: "Show inactive" });
    const thumb = toggle.querySelector("span");

    expect(thumb).not.toBeNull();
    expect(thumb).toHaveStyle({ left: "0.25rem" });

    await user.click(toggle);

    expect(thumb).toHaveStyle({ left: "1.75rem" });
  });
});
