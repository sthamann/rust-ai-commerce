UPDATE products SET properties=jsonb_set(properties,'{volume}',to_jsonb((options->>'size')||' ml')) WHERE parent_id='mug' AND options ? 'size';
UPDATE product_reviews SET title='Beautiful form, comfortable to hold',content='Curated example: The cup feels comfortable in the hand.' WHERE demo AND author='Alex' AND title='Schöne Form, angenehme Haptik';
