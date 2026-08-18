import { confirmItem } from "@/app/actions";
import { CATEGORIES, CONDITIONS } from "@/lib/inference";
import type { ItemFull } from "@/lib/data";

type Confidence = Record<string, number>;

/** Under 0.70 the model was told to ask instead of guess — mirror that boundary here. */
function grade(score: number | undefined) {
  if (score === undefined) return null;
  if (score >= 0.85) return { label: "sure", tone: "ok" };
  if (score >= 0.7) return { label: "fairly sure", tone: "warn" };
  return { label: "guessing", tone: "bad" };
}

function Field({
  name,
  label,
  value,
  confidence,
  children,
}: {
  name: string;
  label: string;
  value?: string | number | null;
  confidence?: number;
  children?: React.ReactNode;
}) {
  const g = grade(confidence);
  return (
    <label className="field" htmlFor={name}>
      <span className="field-label">
        {label}
        {g && <span className={`conf conf-${g.tone}`}>{g.label}</span>}
      </span>
      {children ?? <input id={name} name={name} defaultValue={value ?? ""} />}
    </label>
  );
}

export default function ReviewForm({
  item,
  confidence,
  questions,
  reviewed = false,
}: {
  item: ItemFull;
  confidence: Confidence;
  questions: string[];
  reviewed?: boolean;
}) {
  const flaws = item.flaws;

  return (
    <form action={confirmItem} className="review">
      <input type="hidden" name="id" value={item.id} />

      {questions.length > 0 && (
        <div className="questions">
          <span className="questions-label">It couldn&apos;t tell from the photos</span>
          <ul>
            {questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="fieldgrid">
        <Field name="title" label="Title" value={item.title} />
        <Field name="brand" label="Brand" value={item.brand} confidence={confidence.brand} />
        <Field name="category" label="Category" confidence={confidence.category}>
          <select id="category" name="category" defaultValue={item.category}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        <Field name="size" label="Size" value={item.size} confidence={confidence.size} />
        <Field name="color" label="Colour" value={item.color} confidence={confidence.color} />
        <Field name="material" label="Material" value={item.material} confidence={confidence.material} />
        <Field name="condition" label="Condition" confidence={confidence.condition}>
          <select id="condition" name="condition" defaultValue={item.condition}>
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </Field>
        <Field name="cost_basis" label="What you paid">
          <input id="cost_basis" name="cost_basis" type="number" step="0.01" min="0" defaultValue={item.cost_basis} />
        </Field>
        <Field name="list_price" label="List it at">
          <input
            id="list_price"
            name="list_price"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            defaultValue={item.list_price ?? ""}
          />
        </Field>
        <Field name="floor_price" label="Won't go below">
          <input
            id="floor_price"
            name="floor_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.floor_price ?? ""}
            placeholder="optional"
          />
        </Field>
        <Field name="source" label="Sourced from" value={item.source} />
        <Field name="package_size" label="Package size">
          {/* Depop and Mercari both refuse a listing without this, and it's a
              fact about the parcel that no photo reveals. Stored here so the
              extension can fill it instead of stopping. */}
          <select id="package_size" name="package_size" defaultValue={item.package_size ?? ""}>
            <option value="">— pick one —</option>
            <option value="Extra small">Extra small — jewellery, accessories</option>
            <option value="Small">Small — a t-shirt or two</option>
            <option value="Medium">Medium — jeans, a jumper</option>
            <option value="Large">Large — a coat, boots</option>
            <option value="Extra large">Extra large — bulky outerwear</option>
          </select>
        </Field>
      </div>

      <label className="field" htmlFor="flaws">
        <span className="field-label">Flaws — one per line, as you&apos;d write them in a listing</span>
        <textarea id="flaws" name="flaws" rows={3} defaultValue={flaws.join("\n")} />
      </label>

      <label className="field" htmlFor="notes">
        <span className="field-label">Notes</span>
        <textarea id="notes" name="notes" rows={2} defaultValue={item.notes ?? ""} />
      </label>

      <div className="review-actions">
        <button type="submit" className="button">
          {reviewed ? "Save changes" : "Confirm details"}
        </button>
        <span className="muted">
          {reviewed
            ? "Re-generate the listing copy afterwards so it picks up the change."
            : "Nothing is listed anywhere yet — this only accepts the record."}
        </span>
      </div>
    </form>
  );
}
