import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import enMessages from "../i18n/messages/en.json";

type IntlMessages = typeof enMessages;

interface IntlRenderOptions {
  locale?: "en" | "pl";
  messages?: IntlMessages;
}

const getIntlOptions = (options?: IntlRenderOptions) => ({
  locale: options?.locale ?? "en",
  messages: options?.messages ?? enMessages,
});

export function renderWithIntl(ui: ReactElement, options?: IntlRenderOptions) {
  const { locale, messages } = getIntlOptions(options);

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

export function renderWithQueryClient(ui: ReactElement, options?: IntlRenderOptions) {
  const { locale, messages } = getIntlOptions(options);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
