-- =====================================================================
-- 420 CARTEL :: Greenhouse, Indoor & Hydro Demo Flower Expansion
--
-- Adds top-shelf craft flower demo products categorized under
-- Greenhouse, Indoor, and Hydro with hyper-realistic product imagery,
-- full tier pricing ladders, and branch batch allocations.
-- =====================================================================

-- 1. Ensure categories exist
insert into public.catalogue_categories (id, name, product_type, sort_order)
values
  ('49936753-5d0f-46f0-b928-5c18142a8b95', 'Greenhouse', 'FLOWER', 1),
  ('6bb6f742-3c56-491e-92bd-4b02ab092e20', 'Indoor',     'FLOWER', 2),
  ('4dfece1a-9eb5-46b1-a881-ca25c26a6b0f', 'Hydro',      'FLOWER', 3)
on conflict (name) do update
  set sort_order = excluded.sort_order;

-- 2. Link existing flower to Indoor
update public.products
   set category_id = '6bb6f742-3c56-491e-92bd-4b02ab092e20'
 where id in ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002')
   and (category_id is null or category_id != '6bb6f742-3c56-491e-92bd-4b02ab092e20');

-- 3. Insert demo products
insert into public.products (
  id, sku, name, slug, category, base_uom, strain, short_tagline, description,
  brand, thc_pct, cbd_pct, terpene_tags, is_active, is_member_only, is_featured,
  sort_order, hero_media_url, category_id
)
values
  (
    'e1000000-0000-4000-8000-000000000017',
    'CRT-FL-CANDY38',
    'Candy Games #38',
    'candy-games-38',
    'FLOWER',
    'GRAMS',
    'HYBRID',
    'Chunky indoor craft bud. Heavy frost & confection gas.',
    'An elite indoor phenotype known for its massive, fat swollen calyxes encrusted in a blanket of crystalline trichomes. Delivers mouthwatering candied fruit terpenes backed by pungent diesel. Hand-trimmed and slow-cured for 21 days.',
    '420 Cartel Reserve',
    28.5,
    0.1,
    array['d-Limonene', 'β-Caryophyllene', 'Linalool'],
    true,
    true,
    true,
    3,
    '/products/candy-games-38.webp',
    '6bb6f742-3c56-491e-92bd-4b02ab092e20'
  ),
  (
    'e1000000-0000-4000-8000-000000000018',
    'CRT-FL-VALLEYTAN',
    'Valley Sun Tangie',
    'valley-sun-tangie',
    'FLOWER',
    'GRAMS',
    'SATIVA',
    'Full-sun greenhouse flower. Rich natural terpenes & warm citrus.',
    'Cultivated in high-altitude light-dep greenhouse tunnels under the Gauteng sun. Naturally sun-kissed, loaded with sticky resin heads, bright citrus-zest aromas and sweet earthy finish.',
    '420 Cartel Sun Craft',
    24.2,
    0.2,
    array['Terpinolene', 'Myrcene', 'Valencene'],
    true,
    false,
    true,
    4,
    '/products/valley-sun-tangie.webp',
    '49936753-5d0f-46f0-b928-5c18142a8b95'
  ),
  (
    'e1000000-0000-4000-8000-000000000019',
    'CRT-FL-GHBISCOTTI',
    'Greenhouse Biscotti Mintz',
    'greenhouse-biscotti-mintz',
    'FLOWER',
    'GRAMS',
    'HYBRID',
    'Sun-assisted hybrid. Dense structure with sweet cream and gas.',
    'Light-assisted greenhouse cultivation yielding dense, resinous spears with frosty calyxes and deep floral undertones. Subtle cooling spearmint on the exhale.',
    '420 Cartel Sun Craft',
    25.8,
    0.1,
    array['β-Caryophyllene', 'Limonene', 'Humulene'],
    true,
    false,
    false,
    5,
    '/products/greenhouse-biscotti.webp',
    '49936753-5d0f-46f0-b928-5c18142a8b95'
  ),
  (
    'e1000000-0000-4000-8000-000000000020',
    'CRT-FL-HYDRORS11',
    'Hydroponic RS-11',
    'hydroponic-rs11',
    'FLOWER',
    'GRAMS',
    'HYBRID',
    'Deep water culture. Diamond trichome frost & exotic sherbet.',
    'Grown in recirculating deep water hydroponic systems under full-spectrum LEDs. Pristine trichome heads, electric lavender-and-lime calyxes, and an intensely sweet berry gas profile.',
    '420 Cartel Hydro Labs',
    31.2,
    0.1,
    array['Limonene', 'β-Caryophyllene', 'Nerolidol', 'Linalool'],
    true,
    true,
    true,
    6,
    '/products/hydro-rs11.webp',
    '4dfece1a-9eb5-46b1-a881-ca25c26a6b0f'
  ),
  (
    'e1000000-0000-4000-8000-000000000021',
    'CRT-FL-HYDROMAC1',
    'Hydro Mac 1',
    'hydro-mac-1',
    'FLOWER',
    'GRAMS',
    'HYBRID',
    'Closed-loop hydro craft. White-out trichome coverage.',
    'Precision-fed closed-loop hydro cultivation. Alien-like resin density resembling a blanket of powdered sugar over rock-hard emerald and silver nugs.',
    '420 Cartel Hydro Labs',
    30.6,
    0.2,
    array['Limonene', 'Pinene', 'Caryophyllene'],
    true,
    true,
    false,
    7,
    '/products/hydro-mac1.webp',
    '4dfece1a-9eb5-46b1-a881-ca25c26a6b0f'
  )
on conflict (id) do update set
  name = excluded.name,
  sku = excluded.sku,
  short_tagline = excluded.short_tagline,
  description = excluded.description,
  hero_media_url = excluded.hero_media_url,
  category_id = excluded.category_id,
  sort_order = excluded.sort_order;

-- 4. Insert variants
insert into public.product_variants (
  id, product_id, label, base_quantity, price_cents, barcode, is_active, is_custom_amount, pos_quick_key, sort_order
)
values
  -- Candy Games #38 (Indoor)
  ('f1000000-0000-4000-8000-000000000039', 'e1000000-0000-4000-8000-000000000017', '1g', 1, 26000, '6000000000039', true, false, true, 1),
  ('f1000000-0000-4000-8000-000000000040', 'e1000000-0000-4000-8000-000000000017', '3.5g', 3.5, 84630, '6000000000040', true, false, true, 2),
  ('f1000000-0000-4000-8000-000000000041', 'e1000000-0000-4000-8000-000000000017', '7g', 7, 160160, '6000000000041', true, false, true, 3),
  ('f1000000-0000-4000-8000-000000000042', 'e1000000-0000-4000-8000-000000000017', '14g', 14, 302120, '6000000000042', true, false, true, 4),
  ('f1000000-0000-4000-8000-000000000043', 'e1000000-0000-4000-8000-000000000017', '28g', 28, 553280, '6000000000043', true, false, true, 5),
  ('f1000000-0000-4000-8000-000000000044', 'e1000000-0000-4000-8000-000000000017', 'Custom (scale)', 1, 26000, '6000000000044', true, true, false, 6),

  -- Valley Sun Tangie (Greenhouse)
  ('f1000000-0000-4000-8000-000000000045', 'e1000000-0000-4000-8000-000000000018', '1g', 1, 18000, '6000000000045', true, false, true, 1),
  ('f1000000-0000-4000-8000-000000000046', 'e1000000-0000-4000-8000-000000000018', '3.5g', 3.5, 58590, '6000000000046', true, false, true, 2),
  ('f1000000-0000-4000-8000-000000000047', 'e1000000-0000-4000-8000-000000000018', '7g', 7, 110880, '6000000000047', true, false, true, 3),
  ('f1000000-0000-4000-8000-000000000048', 'e1000000-0000-4000-8000-000000000018', '14g', 14, 209160, '6000000000048', true, false, true, 4),
  ('f1000000-0000-4000-8000-000000000049', 'e1000000-0000-4000-8000-000000000018', '28g', 28, 383040, '6000000000049', true, false, true, 5),
  ('f1000000-0000-4000-8000-000000000050', 'e1000000-0000-4000-8000-000000000018', 'Custom (scale)', 1, 18000, '6000000000050', true, true, false, 6),

  -- Greenhouse Biscotti Mintz (Greenhouse)
  ('f1000000-0000-4000-8000-000000000051', 'e1000000-0000-4000-8000-000000000019', '1g', 1, 19000, '6000000000051', true, false, true, 1),
  ('f1000000-0000-4000-8000-000000000052', 'e1000000-0000-4000-8000-000000000019', '3.5g', 3.5, 61845, '6000000000052', true, false, true, 2),
  ('f1000000-0000-4000-8000-000000000053', 'e1000000-0000-4000-8000-000000000019', '7g', 7, 117040, '6000000000053', true, false, true, 3),
  ('f1000000-0000-4000-8000-000000000054', 'e1000000-0000-4000-8000-000000000019', '14g', 14, 220780, '6000000000054', true, false, true, 4),
  ('f1000000-0000-4000-8000-000000000055', 'e1000000-0000-4000-8000-000000000019', '28g', 28, 404320, '6000000000055', true, false, true, 5),
  ('f1000000-0000-4000-8000-000000000056', 'e1000000-0000-4000-8000-000000000019', 'Custom (scale)', 1, 19000, '6000000000056', true, true, false, 6),

  -- Hydroponic RS-11 (Hydro)
  ('f1000000-0000-4000-8000-000000000057', 'e1000000-0000-4000-8000-000000000020', '1g', 1, 32000, '6000000000057', true, false, true, 1),
  ('f1000000-0000-4000-8000-000000000058', 'e1000000-0000-4000-8000-000000000020', '3.5g', 3.5, 104160, '6000000000058', true, false, true, 2),
  ('f1000000-0000-4000-8000-000000000059', 'e1000000-0000-4000-8000-000000000020', '7g', 7, 197120, '6000000000059', true, false, true, 3),
  ('f1000000-0000-4000-8000-000000000060', 'e1000000-0000-4000-8000-000000000020', '14g', 14, 371840, '6000000000060', true, false, true, 4),
  ('f1000000-0000-4000-8000-000000000061', 'e1000000-0000-4000-8000-000000000020', '28g', 28, 680960, '6000000000061', true, false, true, 5),
  ('f1000000-0000-4000-8000-000000000062', 'e1000000-0000-4000-8000-000000000020', 'Custom (scale)', 1, 32000, '6000000000062', true, true, false, 6),

  -- Hydro Mac 1 (Hydro)
  ('f1000000-0000-4000-8000-000000000063', 'e1000000-0000-4000-8000-000000000021', '1g', 1, 30000, '6000000000063', true, false, true, 1),
  ('f1000000-0000-4000-8000-000000000064', 'e1000000-0000-4000-8000-000000000021', '3.5g', 3.5, 97650, '6000000000064', true, false, true, 2),
  ('f1000000-0000-4000-8000-000000000065', 'e1000000-0000-4000-8000-000000000021', '7g', 7, 184800, '6000000000065', true, false, true, 3),
  ('f1000000-0000-4000-8000-000000000066', 'e1000000-0000-4000-8000-000000000021', '14g', 14, 348600, '6000000000066', true, false, true, 4),
  ('f1000000-0000-4000-8000-000000000067', 'e1000000-0000-4000-8000-000000000021', '28g', 28, 638400, '6000000000067', true, false, true, 5),
  ('f1000000-0000-4000-8000-000000000068', 'e1000000-0000-4000-8000-000000000021', 'Custom (scale)', 1, 30000, '6000000000068', true, true, false, 6)
on conflict (id) do nothing;
