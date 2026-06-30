"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SearchableSelect, Select, Icon } from "@devdigest/ui";
import { useSettings, useUpdateSettings } from "../../../../../../../lib/hooks";
import { useProviderModels } from "../../../../../../../lib/hooks/agents";
import { toModelOptions } from "../../../../../../../lib/model-label";
import { FEATURE_MODELS } from "../../../../../../../lib/feature-models";
import type { FeatureModelChoice, FeatureModelDef, FeatureModelId, Provider } from "../../../../../../../lib/types";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
] as const;

/**
 * Settings → Feature Models. One provider+model picker per system LLM feature;
 * the model list and prices come LIVE from the selected provider, and the choice
 * persists to `settings.feature_models`. Each feature falls back to its registry
 * default when unset.
 */
export function SettingsModels() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();

  const chosen = (settings?.feature_models ?? {}) as Partial<Record<FeatureModelId, FeatureModelChoice>>;

  const save = (id: FeatureModelId, choice: FeatureModelChoice) =>
    update.mutate({ feature_models: { ...chosen, [id]: choice } });

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("models.title")} body={t("models.body")} />
      {FEATURE_MODELS.map((f) => (
        <FeatureModelRow key={f.id} feature={f} chosen={chosen[f.id]} onSave={save} />
      ))}
      <div style={s.note}>
        <Icon.Info size={15} style={s.noteIcon} />
        <span>{t("models.liveNote")}</span>
      </div>
    </div>
  );
}

function FeatureModelRow({
  feature,
  chosen,
  onSave,
}: {
  feature: FeatureModelDef;
  chosen: FeatureModelChoice | undefined;
  onSave: (id: FeatureModelId, choice: FeatureModelChoice) => void;
}) {
  const t = useTranslations("settings");
  const [provider, setProvider] = React.useState<Provider>(
    chosen?.provider ?? feature.defaultProvider,
  );
  const [model, setModel] = React.useState(chosen?.model ?? feature.defaultModel);

  React.useEffect(() => {
    setProvider(chosen?.provider ?? feature.defaultProvider);
    setModel(chosen?.model ?? feature.defaultModel);
  }, [chosen?.provider, chosen?.model, feature.defaultProvider, feature.defaultModel]);
  const { data: models } = useProviderModels(provider);
  const isDefault = !chosen;
  const baseOptions = toModelOptions(models);
  const options = baseOptions.some((o) => (typeof o === "string" ? o : o.value) === model)
    ? baseOptions
    : [model, ...baseOptions].filter(Boolean);

  const handleProviderChange = (v: string) => {
    setProvider(v as Provider);
    setModel("");
  };

  const handleModelChange = (m: string) => {
    setModel(m);
    onSave(feature.id, { provider, model: m });
  };

  return (
    <div style={s.row}>
      <FormField
        label={
          <>
            {feature.label}
            {isDefault && <span style={s.defaultTag}>{t("models.usingDefault")}</span>}
          </>
        }
        hint={feature.description}
      >
        <div style={s.providerRow}>
          <Select
            value={provider}
            onChange={handleProviderChange}
            options={[...PROVIDER_OPTIONS]}
          />
          <SearchableSelect
            value={model}
            onChange={handleModelChange}
            options={options}
            placeholder={t("models.search")}
          />
        </div>
      </FormField>
    </div>
  );
}
