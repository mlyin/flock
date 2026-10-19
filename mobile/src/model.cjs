const CONDITIONS = ["nwt", "excellent", "good", "fair"];
function amount(value, label, optional = false) {
  if (optional && String(value ?? "").trim() === "") return null;
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error(
      `${label} must be a positive amount with at most two decimals.`,
    );
  const number = Number(text);
  if (!Number.isFinite(number) || number > 99999999.99)
    throw new Error(`${label} is too large.`);
  return number;
}
function itemInput(form) {
  const title = String(form.title ?? "").trim();
  if (!title || title.length > 160)
    throw new Error("Enter a garment title of 1–160 characters.");
  if (!CONDITIONS.includes(form.condition))
    throw new Error("Choose a condition.");
  const cost = amount(form.cost_basis, "Cost");
  const price = amount(form.list_price, "Asking price", true);
  const floor = amount(form.floor_price, "Minimum price", true);
  if (price !== null && floor !== null && floor > price)
    throw new Error("Minimum price cannot exceed the asking price.");
  return {
    title,
    brand: String(form.brand ?? "").trim(),
    size: String(form.size ?? "").trim(),
    category: String(form.category ?? "").trim() || "Other",
    condition: form.condition,
    notes: String(form.notes ?? "").trim(),
    cost_basis: cost,
    list_price: price,
    floor_price: floor,
  };
}
function draftText(item) {
  return [
    item.title,
    [
      item.brand,
      item.size && `Size ${item.size}`,
      item.condition === "nwt" ? "New with tags" : item.condition,
    ]
      .filter(Boolean)
      .join(" · "),
    item.notes,
    item.list_price != null
      ? `Asking $${Number(item.list_price).toFixed(2)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
function metrics(items) {
  return {
    count: items.length,
    cost: items.reduce((n, i) => n + Number(i.cost_basis || 0), 0),
    asking: items
      .filter((i) => !["sold", "donated"].includes(i.status))
      .reduce((n, i) => n + Number(i.list_price || 0), 0),
  };
}
module.exports = { CONDITIONS, amount, itemInput, draftText, metrics };
