import type { ReactElement, ReactNode } from 'react';
import type { Said } from './index.js';

export interface HexagonProps {
  size?: number;
  src?: string | null;
  placeholder?: string | null;
  hold?: { src: string; caption?: string } | null;
  mine?: boolean;
  onSelect?: (() => void) | null;
  reveal?: boolean;
  cropping?: { url: string; style?: Record<string, number> } | null;
  label?: string | null;
  addLabel?: string;
  className?: string;
  children?: ReactNode;
}
export declare function Hexagon(props: HexagonProps): ReactElement;

export interface HexagonEditorProps {
  src?: string | null;
  placeholder?: string | null;
  post: (body: Record<string, unknown>, upload?: { blob: Blob; name?: string }) => Promise<any>;
  onDone?: (pfp: Said) => void;
  onClose?: () => void;
  sources?: Array<'opensea' | 'ens' | 'x'>;
  size?: number;
  className?: string;
}
export declare function HexagonEditor(props: HexagonEditorProps): ReactElement;
export declare function useFirstReveal(address: string | null | undefined, src: string | null | undefined): boolean;
