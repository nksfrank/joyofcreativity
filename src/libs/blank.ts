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
  { id: "blank1", colorId: "cream", sizeId: "small", stock: 5 },
  { id: "blank2", colorId: "cream", sizeId: "medium", stock: 3 },
  { id: "blank3", colorId: "cream", sizeId: "large", stock: 0 },
  { id: "blank4", colorId: "red", sizeId: "small", stock: 2 },
  { id: "blank5", colorId: "red", sizeId: "medium", stock: 3 },
  { id: "blank6", colorId: "red", sizeId: "large", stock: 0 },
  { id: "blank7", colorId: "blue", sizeId: "small", stock: 1 },
  { id: "blank8", colorId: "blue", sizeId: "medium", stock: 0 },
  { id: "blank9", colorId: "blue", sizeId: "large", stock: 4 },
  { id: "blank10", colorId: "green", sizeId: "small", stock: 0 },
  { id: "blank11", colorId: "green", sizeId: "medium", stock: 2 },
  { id: "blank12", colorId: "green", sizeId: "large", stock: 3 },
  { id: "blank13", colorId: "yellow", sizeId: "small", stock: 1 },
  { id: "blank14", colorId: "yellow", sizeId: "medium", stock: 0 },
  { id: "blank15", colorId: "yellow", sizeId: "large", stock: 2 },
  { id: "blank16", colorId: "black", sizeId: "small", stock: 0 },
  { id: "blank17", colorId: "black", sizeId: "medium", stock: 1 },
  { id: "blank18", colorId: "black", sizeId: "large", stock: 3 },
  { id: "blank19", colorId: "white", sizeId: "small", stock: 2 },
  { id: "blank20", colorId: "white", sizeId: "medium", stock: 0 },
  { id: "blank21", colorId: "white", sizeId: "large", stock: 1 },
  { id: "blank22", colorId: "cream", sizeId: "eu-100", stock: 2 },
  { id: "blank23", colorId: "cream", sizeId: "eu-120", stock: 0 },
  { id: "blank24", colorId: "cream", sizeId: "eu-140", stock: 1 },
  { id: "blank25", colorId: "red", sizeId: "eu-100", stock: 0 },
  { id: "blank26", colorId: "red", sizeId: "eu-120", stock: 3 },
  { id: "blank27", colorId: "red", sizeId: "eu-140", stock: 2 },
  { id: "blank28", colorId: "blue", sizeId: "eu-100", stock: 1 },
  { id: "blank29", colorId: "blue", sizeId: "eu-120", stock: 0 },
  { id: "blank30", colorId: "blue", sizeId: "eu-140", stock: 4 },
  { id: "blank31", colorId: "green", sizeId: "eu-100", stock: 0 },
  { id: "blank32", colorId: "green", sizeId: "eu-120", stock: 2 },
  { id: "blank33", colorId: "green", sizeId: "eu-140", stock: 3 },
  { id: "blank34", colorId: "yellow", sizeId: "eu-100", stock: 1 },
  { id: "blank35", colorId: "yellow", sizeId: "eu-120", stock: 0 },
  { id: "blank36", colorId: "yellow", sizeId: "eu-140", stock: 2 },
  { id: "blank37", colorId: "black", sizeId: "eu-100", stock: 0 },
  { id: "blank38", colorId: "black", sizeId: "eu-120", stock: 1 },
  { id: "blank39", colorId: "black", sizeId: "eu-140", stock: 3 },
  { id: "blank40", colorId: "white", sizeId: "eu-100", stock: 2 },
  { id: "blank41", colorId: "white", sizeId: "eu-120", stock: 0 },
  { id: "blank42", colorId: "white", sizeId: "eu-140", stock: 1 },
];

export const getBlankById = (id: string): Blank | undefined =>
  blanks.find((blank) => blank.id === id);
