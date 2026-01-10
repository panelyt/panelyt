"use client";

import { useState } from "react";
import { Copy, Settings, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Chip } from "@/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { IconButton } from "@/ui/icon-button";
import { SegmentedControl } from "@/ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/tooltip";

export function UiDemo() {
  const t = useTranslations("uiDemo");
  const tCommon = useTranslations("common");
  const [segment, setSegment] = useState("optionA");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
          {t("subtitle")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-primary">{t("title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("buttons")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>{tCommon("save")}</Button>
          <Button variant="secondary">{tCommon("edit")}</Button>
          <Button variant="destructive">{tCommon("delete")}</Button>
          <Button loading>{tCommon("save")}</Button>
          <IconButton aria-label={tCommon("share")}>
            <Share2 className="h-4 w-4" />
          </IconButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("chips")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Chip>{t("chipAlt")}</Chip>
          <Chip variant="selected">{t("chipAst")}</Chip>
          <Chip variant="bonus">{t("chipBonus")}</Chip>
          <Chip variant="warn">{t("chipWarn")}</Chip>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dialogs")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{t("openDialog")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{t("dialogTitle")}</DialogTitle>
              <DialogDescription className="mt-2">{t("dialogDescription")}</DialogDescription>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary">{tCommon("cancel")}</Button>
                <Button>{tCommon("save")}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("menus")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">{t("menuTrigger")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>
                <Copy className="h-4 w-4" />
                {tCommon("copy")}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="h-4 w-4" />
                {t("menuSettings")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary">{t("tooltips")}</Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipCopy")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("segmented")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentedControl
            value={segment}
            onValueChange={setSegment}
            ariaLabel={t("segmentedLabel")}
            options={[
              { value: "optionA", label: t("optionA") },
              { value: "optionB", label: t("optionB") },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("table")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table dense stickyHeader>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableHeaderName")}</TableHead>
                <TableHead>{t("tableHeaderStatus")}</TableHead>
                <TableHead>{t("tableHeaderValue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono">{t("tableRowAlpha")}</TableCell>
                <TableCell>{t("statusActive")}</TableCell>
                <TableCell className="font-mono">{t("tableValueAlpha")}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">{t("tableRowBeta")}</TableCell>
                <TableCell>{t("statusPending")}</TableCell>
                <TableCell className="font-mono">{t("tableValueBeta")}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
