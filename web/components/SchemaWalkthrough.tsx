import type { FC } from "react";

export type SchemaWalkthroughProps = {
  onAdd: () => void;
  onDrop: () => void;
  columnName: string;
  disabled?: boolean;
};

export const SchemaWalkthrough: FC<SchemaWalkthroughProps> = ({ onAdd, onDrop, columnName, disabled }) => {
  return (
    <section className="sim-shell__schema-demo" aria-label="Schema walkthrough">
      <header>
        <h4>Schema walkthrough</h4>
        <p>Add or drop <code>{columnName}</code> while events stream to compare capture behaviour.</p>
      </header>
      <div className="sim-shell__schema-demo-buttons">
        <button type="button" onClick={onAdd} disabled={disabled} data-tour-target="schema-add">
          Add {columnName}
        </button>
        <button type="button" onClick={onDrop} disabled={disabled} data-tour-target="schema-drop">
          Drop {columnName}
        </button>
      </div>
    </section>
  );
};

export default SchemaWalkthrough;
