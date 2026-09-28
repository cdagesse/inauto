CREATE INDEX "auction_result_model_ended_idx" ON "auction_result" USING btree ("model_id","ended_at");--> statement-breakpoint
CREATE INDEX "auction_result_vin_idx" ON "auction_result" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "car_view_day_idx" ON "car_view" USING btree ("day");--> statement-breakpoint
CREATE INDEX "dealer_active_model_day_idx" ON "dealer_active" USING btree ("model_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "dealer_active_vin_day_idx" ON "dealer_active" USING btree ("vin","snapshot_date");--> statement-breakpoint
CREATE INDEX "dealer_sale_vin_idx" ON "dealer_sale" USING btree ("vin") WHERE vin is not null;--> statement-breakpoint
CREATE INDEX "external_listing_vin_idx" ON "external_listing" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "listing_vin_upper_idx" ON "listing" USING btree (upper("vin"));