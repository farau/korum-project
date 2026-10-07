// Application policy; ERC-20 itself does not define a logo format or size.
export const TOKEN_IMAGE_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const TOKEN_IMAGE_MAX_OUTPUT_BYTES = 100 * 1024;
export const TOKEN_IMAGE_DIMENSION = 256;
export const TOKEN_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type UploadedTokenImage = {
  cid: string;
  uri: string;
  bytes: number;
};
