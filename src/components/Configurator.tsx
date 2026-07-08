import { useMemo, useState } from "preact/hooks";
import type { Locale } from "@/i18n/runtime";
import {
  ConfigurationModel,
  type OptionView,
  type Selection,
} from "@/libs/configuration";
import { formatMoney } from "@/libs/pricing";
import type { ProductDefinition } from "@/libs/product.types";
import { addLine } from "@/stores/cart";

type Props = {
  definition: ProductDefinition;
  colorId: string;
  colourName: string;
  productName: string;
  locale: Locale;
};

const emptySelection: Selection = {
  sizeId: undefined,
  patternId: undefined,
  yarnColorIds: [],
  customisation: "",
};

function RadioGroup({
  legend,
  name,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  name: string;
  options: OptionView[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={name}
            value={option.id}
            disabled={option.disabled}
            checked={selected === option.id}
            onChange={() => onSelect(option.id)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export default function Configurator({
  definition,
  colorId,
  colourName,
  productName,
  locale,
}: Props) {
  const [selection, setSelection] = useState<Selection>(emptySelection);

  const model = useMemo(
    () => new ConfigurationModel(definition, colorId, selection),
    [definition, colorId, selection],
  );

  const sizeOptions = model.sizeOptions();
  const patternOptions = model.patternOptions();
  const yarnOptions = model.yarnOptions();
  const price = model.price();
  const orderItem = model.orderItem();
  const deadEnd = model.deadEnd();
  const rule = definition.customisation;

  const update = (partial: Partial<Selection>) =>
    setSelection((prev) => ({ ...prev, ...partial }));

  const toggleYarn = (id: string) =>
    setSelection((prev) => ({
      ...prev,
      yarnColorIds: prev.yarnColorIds.includes(id)
        ? prev.yarnColorIds.filter((y) => y !== id)
        : [...prev.yarnColorIds, id],
    }));

  const resetDeadEnd = () => {
    if (deadEnd) {
      update({ [deadEnd.reset]: undefined });
    }
  };

  const addToCart = () => {
    // orderItem is non-null only when the selection prices, so price is set here.
    if (!orderItem || !price) {
      return;
    }
    const label = (options: OptionView[], id: string | undefined) =>
      options.find((option) => option.id === id)?.label ?? "";
    addLine({
      productId: definition.id,
      item: orderItem,
      price,
      display: {
        productName,
        colour: colourName,
        size: label(sizeOptions, selection.sizeId),
        pattern: label(patternOptions, selection.patternId),
        yarnColours: selection.yarnColorIds.map((id) => label(yarnOptions, id)),
        customisation: selection.customisation,
      },
    });
  };

  return (
    <section aria-label="Configure">
      <RadioGroup
        legend="Size"
        name="size"
        options={sizeOptions}
        selected={selection.sizeId}
        onSelect={(id) => update({ sizeId: id })}
      />

      <RadioGroup
        legend="Pattern"
        name="pattern"
        options={patternOptions}
        selected={selection.patternId}
        onSelect={(id) => update({ patternId: id })}
      />

      <fieldset>
        <legend>Yarn Colours</legend>
        {yarnOptions.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              name="yarn"
              value={option.id}
              disabled={option.disabled}
              checked={selection.yarnColorIds.includes(option.id)}
              onChange={() => toggleYarn(option.id)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {rule.allowText && (
        <p>
          <label>
            Custom Text
            <input
              type="text"
              name="customisation"
              maxLength={rule.maxLength}
              value={selection.customisation}
              onInput={(event) =>
                update({ customisation: event.currentTarget.value })
              }
            />
          </label>
        </p>
      )}

      <p data-testid="product-price">
        {price ? formatMoney(price, locale) : "Select a size and pattern"}
      </p>

      <button type="button" onClick={addToCart} disabled={!orderItem}>
        Add to cart
      </button>

      {deadEnd && (
        <div role="alertdialog" aria-label="No available combination">
          <p>{deadEnd.reason}</p>
          <button type="button" onClick={resetDeadEnd}>
            Reset selection
          </button>
        </div>
      )}
    </section>
  );
}
