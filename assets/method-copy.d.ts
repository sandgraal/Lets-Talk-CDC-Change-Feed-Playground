export type MethodCopyEntry = {
  label: string;
  laneDescription: string;
  callout: string;
  whenToUse: string;
  tooltip?: string;
};

declare const METHOD_COPY: Record<string, MethodCopyEntry>;

export default METHOD_COPY;
export { METHOD_COPY };
