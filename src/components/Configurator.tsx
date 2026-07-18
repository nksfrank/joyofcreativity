import { actions } from "astro:actions";
import { useEffect, useState } from "preact/hooks";
import type { Locale } from "@/i18n/runtime";
import type { StockSnapshot } from "@/libs/blank.types";
import {
  ConfigurationModel,
  type OptionView,
  type Selection,
} from "@/libs/configuration";
import { Money } from "@/libs/money";
import type { ProductDefinition } from "@/libs/product.types";
import { addLine } from "@/stores/cart";

type Props = {
  definition: ProductDefinition;
  colorId: string;
  colourName: string;
  productName: string;
  locale: Locale;
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
  // The model owns the initial selection: a structurally-single size/pattern is
  // pre-filled so a fully single-option product prices on load (ADR-0010). The
  // island never derives defaults itself, and the lazy initializer runs once so
  // an auto-selected option stays fixed for the session.
  const [selection, setSelection] = useState<Selection>(() =>
    ConfigurationModel.defaultSelection(definition, colorId),
  );

  // Stock is the live D1 read, fetched once on mount (#62) — the store the shop
  // controls, not a code constant. `null` until it arrives; the snapshot is
  // advisory (ADR-0003), so once loaded every selection prices/feasibility-checks
  // instantly against it with no further round-trip. An Action error resolves to
  // an empty snapshot rather than sitting on "Loading…" forever.
  const [stock, setStock] = useState<StockSnapshot | null>(null);
  useEffect(() => {
    let active = true;
    actions
      .getStock({ productId: definition.id })
      .then(({ data, error }) => {
        if (!active) return;
        setStock(error ? new Map() : data);
      })
      .catch(() => {
        if (active) setStock(new Map());
      });
    return () => {
      active = false;
    };
  }, [definition.id]);

  const update = (partial: Partial<Selection>) =>
    setSelection((prev) => ({ ...prev, ...partial }));

  // Yarn is one required select per field (ADR-0009); writing a field's pick by
  // index keeps duplicates across fields and leaves other fields untouched.
  const selectYarn = (index: number, id: string) =>
    setSelection((prev) => {
      const yarnColorIds = [...prev.yarnColorIds];
      yarnColorIds[index] = id;
      return { ...prev, yarnColorIds };
    });

  // Before the snapshot lands there is no availability to project, so the island
  // shows a loading state rather than guessing (a fixture read is gone, #62).
  if (stock === null) {
    return (
      <section aria-label="Configure">
        <p>Loading availability…</p>
      </section>
    );
  }

  // The model is a pure projection of (definition, colorId, stock, selection) — a
  // derived value, not state. Construction is cheap and its identity is never a
  // hook/child dependency, so it's built inline each render rather than memoised.
  const model = new ConfigurationModel(definition, colorId, stock, selection);

  // One projection, one seam (ADR-0005): the island reads every field list, the
  // customisation rule, the dead-end signal, and the priceable trio from this
  // single record — never from the ProductDefinition. `ready` is non-null only
  // when the selection is a complete, valid, in-stock order item.
  const {
    sizeOptions,
    patternOptions,
    yarnFields,
    customisationRule: rule,
    deadEnd,
    ready,
  } = model.view();

  const resetDeadEnd = () => {
    if (deadEnd) {
      update({ [deadEnd.reset]: undefined });
    }
  };

  const addToCart = () => {
    // `ready` bundles the order item, price, and labels behind one invariant: it
    // is non-null only when the selection prices. The model owns every domain
    // label (ADR-0005); the island adds only the route-/prop-level colour and
    // product name.
    if (!ready) {
      return;
    }
    addLine({
      productId: definition.id,
      item: ready.orderItem,
      price: ready.price,
      display: {
        productName,
        colour: colourName,
        size: ready.labels.size,
        pattern: ready.labels.pattern,
        yarnColours: ready.labels.yarnColours,
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

      {yarnFields.length > 0 && (
        <fieldset>
          <legend>Yarn Colours</legend>
          {yarnFields.map((field) => (
            <label key={field.index}>
              Yarn colour {field.index + 1}
              <select
                name={`yarn-${field.index}`}
                value={field.selectedId ?? ""}
                onChange={(event) =>
                  selectYarn(field.index, event.currentTarget.value)
                }
              >
                <option value="">Select a colour</option>
                {field.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}

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
        {ready
          ? Money.from(ready.price).format(locale)
          : "Select a size and pattern"}
      </p>

      <button type="button" onClick={addToCart} disabled={!ready}>
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
