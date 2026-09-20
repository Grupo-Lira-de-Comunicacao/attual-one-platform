import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_VIDEO_BYTES,
  productMediaObjectPath,
  validateProductMedia,
} from "../lib/product-media.ts";

test("accepts supported product images and rejects oversized files", () => {
  assert.equal(validateProductMedia("image","image/jpeg",1024), null);
  assert.match(validateProductMedia("image","image/jpeg",MAX_PRODUCT_IMAGE_BYTES+1) ?? "", /8 MB/);
  assert.match(validateProductMedia("image","image/gif",1024) ?? "", /JPG, PNG ou WebP/);
});

test("accepts mp4 webm and mov videos with 50 MB limit", () => {
  assert.equal(validateProductMedia("video","video/mp4",1024), null);
  assert.equal(validateProductMedia("video","video/webm",1024), null);
  assert.equal(validateProductMedia("video","video/quicktime",1024), null);
  assert.match(validateProductMedia("video","video/mp4",MAX_PRODUCT_VIDEO_BYTES+1) ?? "", /50 MB/);
});

test("builds media path scoped by company and kind", () => {
  assert.equal(
    productMediaObjectPath(
      "11111111-1111-4111-8111-111111111111",
      "video",
      "produto final.MP4",
      "video/mp4",
      "22222222-2222-4222-8222-222222222222",
    ),
    "11111111-1111-4111-8111-111111111111/products/video/22222222-2222-4222-8222-222222222222.mp4",
  );
});
