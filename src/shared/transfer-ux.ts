export type TransferOperation = "export" | "import" | "encrypted-export" | "encrypted-import";

export type TransferUxState =
  | { phase: "idle" }
  | { phase: "working"; operation: TransferOperation; message: string }
  | { phase: "success"; operation: TransferOperation; message: string }
  | { phase: "error"; operation: TransferOperation; message: string; recoveryHint: string };

export function startTransfer(
  operation: TransferOperation,
  message: string,
): TransferUxState {
  return { phase: "working", operation, message };
}

export function succeedTransfer(
  operation: TransferOperation,
  message: string,
): TransferUxState {
  return { phase: "success", operation, message };
}

export function failTransfer(
  operation: TransferOperation,
  message: string,
): TransferUxState {
  const recoveryHint =
    operation === "import" || operation === "encrypted-import"
      ? "Your existing workspace was not changed. Try another file or export a fresh backup first."
      : "Nothing was exported. Check disk space and try again from Project tools → Backups.";
  return { phase: "error", operation, message, recoveryHint };
}

export function transferOperationLabel(operation: TransferOperation): string {
  switch (operation) {
    case "export":
      return "Export backup";
    case "import":
      return "Import backup";
    case "encrypted-export":
      return "Encrypted export";
    case "encrypted-import":
      return "Encrypted import";
    default:
      return "Transfer";
  }
}
