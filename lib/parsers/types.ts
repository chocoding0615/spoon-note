import type { ParsedPlace, PlaceSource } from "../types";

export interface PlaceParser {
  source: PlaceSource;
  canHandle(url: string): boolean;
  parse(url: string): Promise<ParsedPlace | null>;
}
