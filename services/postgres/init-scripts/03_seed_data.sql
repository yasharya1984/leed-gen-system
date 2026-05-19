INSERT INTO subscription_plans (name, price_in_cents, interval, max_campaigns, max_leads_per_campaign, max_leads_total)
VALUES 
('Free Tier', 0, 'monthly', 1, 100, 100),
('Growth Plan', 4900, 'monthly', 5, 2000, 10000),
('Enterprise Pro', 19900, 'monthly', 50, 10000, 500000)
ON CONFLICT (name) DO NOTHING;
