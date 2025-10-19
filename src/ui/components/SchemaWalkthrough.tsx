import type { FC } from "react";

export type SchemaWalkthroughProps = {
  onAdd: () => void;
  onDrop: () => void;
  columnName: string;
  disabled?: boolean;
  disableAdd?: boolean;
  disableDrop?: boolean;
  status?: string | null;
};

export const SchemaWalkthrough: FC<SchemaWalkthroughProps> = ({
  onAdd,
  onDrop,
  columnName,
  disabled,
  disableAdd,
  disableDrop,
  status,
}) => {
  return (
    <section className="sim-shell__schema-demo" aria-label="Schema walkthrough">
      <header>
        <h4>Schema walkthrough</h4>
        <p>
          Add or drop <code>{columnName}</code> while events stream to compare capture behaviour.
        </p>
      </header>
      {status ? <p className="sim-shell__schema-demo-status">{status}</p> : null}
      <div className="sim-shell__schema-demo-buttons">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || disableAdd}
          data-tour-target="schema-add"
        >
          Add {columnName}
        </button>
        <button
          type="button"
          onClick={onDrop}
          disabled={disabled || disableDrop}
          data-tour-target="schema-drop"
        >
          Drop {columnName}
        </button>
      </div>
    </section>
  );
};

export default SchemaWalkthrough;
