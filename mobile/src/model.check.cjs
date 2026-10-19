const { test } = require("node:test");
const assert = require("node:assert/strict");
const { itemInput, draftText, metrics } = require("./model.cjs");
const input = {
  title: " Linen shirt ",
  condition: "good",
  cost_basis: "12.50",
  list_price: "30",
  floor_price: "25",
  notes: "Small mark near cuff",
};
test("normalize garment and monetary fields", () => {
  const i = itemInput(input);
  assert.equal(i.title, "Linen shirt");
  assert.equal(i.cost_basis, 12.5);
  assert.equal(i.list_price, 30);
});
test("reject invalid prices and floor above ask", () => {
  for (const v of ["-1", "Infinity", "1.234", "1e3", ""])
    assert.throws(() => itemInput({ ...input, cost_basis: v }));
  assert.throws(() => itemInput({ ...input, floor_price: "31" }));
});
test("shared draft contains flaws but never private cost or floor", () => {
  const text = draftText({ ...input, cost_basis: 987.65, floor_price: 876.54 });
  assert.match(text, /Small mark/);
  assert.match(text, /30.00/);
  assert.ok(!text.includes("987.65"));
  assert.ok(!text.includes("876.54"));
});
test("asking value excludes sold and donated inventory", () =>
  assert.deepEqual(
    metrics([
      { cost_basis: 5, list_price: 20, status: "draft" },
      { cost_basis: 4, list_price: 30, status: "sold" },
      { cost_basis: 2, list_price: 10, status: "donated" },
    ]),
    { count: 3, cost: 11, asking: 20 },
  ));
