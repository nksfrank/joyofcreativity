import type { Blank, Color, Size } from "./blank.types";

export const colors: Color[] = [
  { id: "cream", name: "Cream" },
  { id: "red", name: "Red" },
  { id: "blue", name: "Blue" },
  { id: "green", name: "Green" },
  { id: "yellow", name: "Yellow" },
  { id: "black", name: "Black" },
  { id: "white", name: "White" },
];

export const sizes: Size[] = [
  { id: "small", name: "Small" },
  { id: "medium", name: "Medium" },
  { id: "large", name: "Large" },
  { id: "eu-100", name: "100" },
  { id: "eu-120", name: "120" },
  { id: "eu-140", name: "140" },
];

export const blanks: Blank[] = [
  { id: "blank1", colorId: "cream", sizeId: "small" },
  { id: "blank2", colorId: "cream", sizeId: "medium" },
  { id: "blank3", colorId: "cream", sizeId: "large" },
  { id: "blank4", colorId: "red", sizeId: "small" },
  { id: "blank5", colorId: "red", sizeId: "medium" },
  { id: "blank6", colorId: "red", sizeId: "large" },
  { id: "blank7", colorId: "blue", sizeId: "small" },
  { id: "blank8", colorId: "blue", sizeId: "medium" },
  { id: "blank9", colorId: "blue", sizeId: "large" },
  { id: "blank10", colorId: "green", sizeId: "small" },
  { id: "blank11", colorId: "green", sizeId: "medium" },
  { id: "blank12", colorId: "green", sizeId: "large" },
  { id: "blank13", colorId: "yellow", sizeId: "small" },
  { id: "blank14", colorId: "yellow", sizeId: "medium" },
  { id: "blank15", colorId: "yellow", sizeId: "large" },
  { id: "blank16", colorId: "black", sizeId: "small" },
  { id: "blank17", colorId: "black", sizeId: "medium" },
  { id: "blank18", colorId: "black", sizeId: "large" },
  { id: "blank19", colorId: "white", sizeId: "small" },
  { id: "blank20", colorId: "white", sizeId: "medium" },
  { id: "blank21", colorId: "white", sizeId: "large" },
  { id: "blank22", colorId: "cream", sizeId: "eu-100" },
  { id: "blank23", colorId: "cream", sizeId: "eu-120" },
  { id: "blank24", colorId: "cream", sizeId: "eu-140" },
  { id: "blank25", colorId: "red", sizeId: "eu-100" },
  { id: "blank26", colorId: "red", sizeId: "eu-120" },
  { id: "blank27", colorId: "red", sizeId: "eu-140" },
  { id: "blank28", colorId: "blue", sizeId: "eu-100" },
  { id: "blank29", colorId: "blue", sizeId: "eu-120" },
  { id: "blank30", colorId: "blue", sizeId: "eu-140" },
  { id: "blank31", colorId: "green", sizeId: "eu-100" },
  { id: "blank32", colorId: "green", sizeId: "eu-120" },
  { id: "blank33", colorId: "green", sizeId: "eu-140" },
  { id: "blank34", colorId: "yellow", sizeId: "eu-100" },
  { id: "blank35", colorId: "yellow", sizeId: "eu-120" },
  { id: "blank36", colorId: "yellow", sizeId: "eu-140" },
  { id: "blank37", colorId: "black", sizeId: "eu-100" },
  { id: "blank38", colorId: "black", sizeId: "eu-120" },
  { id: "blank39", colorId: "black", sizeId: "eu-140" },
  { id: "blank40", colorId: "white", sizeId: "eu-100" },
  { id: "blank41", colorId: "white", sizeId: "eu-120" },
  { id: "blank42", colorId: "white", sizeId: "eu-140" },
];

export const getBlankById = (id: string): Blank | undefined =>
  blanks.find((blank) => blank.id === id);
