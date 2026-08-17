import { confirmItem } from "@/app/actions";
import { CATEGORIES, CONDITIONS } from "@/lib/inference";
import type { ItemWithChannels } from "@/lib/queries";

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
}: {
  item: ItemWithChannels;
  confidence: Confidence;
  questions: string[];
}) {
  const flaws: string[] = item.flaws ? JSON.parse(item.flaws) : [];

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
        <Field name="source" label="Sourced from" value={item.source} />
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
          Confirm details
        </button>
        <span className="muted">
          Nothing is listed anywhere yet — this only accepts the record.
        </span>
      </div>
    </form>
  );
}
