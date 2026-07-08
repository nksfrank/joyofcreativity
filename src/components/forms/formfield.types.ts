export type FormFieldType = "radio" | "radio-colour" | "text";

export interface FormOption<T = string> {
  label: string;
  value: T;
  disabled?: boolean; // driven by availability
}

export interface FormField<T = string> {
  id: string;
  label: string;
  type: FormFieldType;
  options?: FormOption<T>[];
  multiple?: boolean;
  validation?: {
    maxLength?: number;
    required?: boolean;
  };
}
