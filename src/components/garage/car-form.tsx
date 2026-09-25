import { addGarageCarForm } from "@/server/forms";

export function GarageCarForm({
  defaultStatus = "owned",
}: {
  defaultStatus?: "wishlist" | "owned" | "previous";
}) {
  return (
    <form action={addGarageCarForm} className="form" id="add-car">
      <div className="lab">Add a car</div>
      <div className="grid-3">
        <div className="fld">
          <label htmlFor="g-status">Shelf</label>
          <select id="g-status" name="status" defaultValue={defaultStatus}>
            <option value="wishlist">Wish list</option>
            <option value="owned">Currently own</option>
            <option value="previous">Previously owned</option>
          </select>
        </div>
        <div className="fld">
          <label htmlFor="g-make">Make</label>
          <input id="g-make" name="make" required maxLength={60} placeholder="Porsche" />
        </div>
        <div className="fld">
          <label htmlFor="g-model">Model</label>
          <input id="g-model" name="model" required maxLength={80} placeholder="911 GT3 RS" />
        </div>
        <div className="fld">
          <label htmlFor="g-year">Year</label>
          <input id="g-year" name="year" type="number" min={1900} max={2100} inputMode="numeric" />
        </div>
        <div className="fld">
          <label htmlFor="g-trim">Trim / package</label>
          <input id="g-trim" name="trim" maxLength={80} placeholder="Weissach" />
        </div>
        <div className="fld">
          <label htmlFor="g-miles">Miles</label>
          <input id="g-miles" name="miles" type="number" min={0} step={100} inputMode="numeric" />
        </div>
        <div className="fld">
          <label htmlFor="g-color">Color</label>
          <input id="g-color" name="color" maxLength={60} />
        </div>
        <div className="fld">
          <label htmlFor="g-vin">VIN (private)</label>
          <input id="g-vin" name="vin" maxLength={17} autoComplete="off" />
        </div>
        <div className="fld">
          <label htmlFor="g-nick">Nickname</label>
          <input id="g-nick" name="nickname" maxLength={60} />
        </div>
        <div className="fld">
          <label htmlFor="g-pp">Purchase price</label>
          <input
            id="g-pp"
            name="purchasePrice"
            type="number"
            min={0}
            step={500}
            inputMode="numeric"
          />
        </div>
        <div className="fld">
          <label htmlFor="g-acq">Acquired</label>
          <input id="g-acq" name="acquiredAt" type="date" />
        </div>
        <div className="fld">
          <label htmlFor="g-sp">Sale price</label>
          <input id="g-sp" name="salePrice" type="number" min={0} step={500} inputMode="numeric" />
        </div>
        <div className="fld">
          <label htmlFor="g-sold">Sold</label>
          <input id="g-sold" name="soldAt" type="date" />
        </div>
      </div>
      <div className="fld">
        <label htmlFor="g-notes">Notes</label>
        <textarea id="g-notes" name="notes" rows={2} maxLength={2000} />
      </div>
      <div>
        <button type="submit" className="btn primary">
          Add to garage
        </button>
      </div>
    </form>
  );
}
