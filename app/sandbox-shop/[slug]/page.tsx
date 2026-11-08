import { notFound } from "next/navigation";
import { sandboxShop } from "@/lib/cinematic/sandbox-shops";

export default async function SandboxShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = sandboxShop(slug);
  if (!shop) notFound();
  return <main style={{ maxWidth: 640, margin: "5vh auto", padding: 24, fontFamily: "system-ui", lineHeight: 1.5 }}>
    <p style={{ color: "#e13a4a", fontWeight: 800 }}>Demo shop, not a real business</p>
    <h1>{shop.name}</h1>
    <p>Sample auto service website for Toyyo quote requests. No real business is contacted.</p>
    {slug === "lone-star-auto" ? <>
      <h2>Request a quote</h2>
      <form method="post" action="/api/sandbox-shop/lone-star-auto/quote" style={{ display: "grid", gap: 12 }}>
        <label htmlFor="fullName">Full name</label><input id="fullName" name="name" required />
        <label htmlFor="email">Email</label><input id="email" name="email" type="email" required />
        <label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" required />
        <label htmlFor="vehicleYear">Vehicle year</label><input id="vehicleYear" name="vehicleYear" required />
        <label htmlFor="vehicleMake">Vehicle make</label><input id="vehicleMake" name="vehicleMake" required />
        <label htmlFor="vehicleModel">Vehicle model</label><input id="vehicleModel" name="vehicleModel" required />
        <label htmlFor="mileage">Mileage</label><input id="mileage" name="mileage" required />
        <label htmlFor="serviceType">Service type</label><select id="serviceType" name="serviceType" required>
          <option value="brakes">Brakes</option><option value="battery">Battery</option><option value="tires">Tires</option><option value="ac">A/C</option><option value="engine">Engine</option><option value="transmission">Transmission</option><option value="diagnostic">Diagnostic</option>
        </select>
        <label htmlFor="issue">Describe the problem</label><textarea id="issue" name="issue" required />
        <label htmlFor="preferredDate">Preferred date</label><input id="preferredDate" name="preferredDate" type="date" required />
        <button type="submit">Send quote request</button>
      </form>
    </> : <><h2>Contact us</h2><p>There is no website quote form. Email the service desk:</p><a href="mailto:service@trinity-brake.demo">service@trinity-brake.demo</a></>}
  </main>;
}
