let counter = 0;

export function nanoid(prefix = "tx") {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}
