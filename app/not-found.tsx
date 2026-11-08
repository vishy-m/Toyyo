import type { Metadata } from "next";
import Link from "next/link";
import { VEHICLES } from "@/lib/cinematic/vehicles";
import { carPath } from "@/components/cinematic/sections";
import "@/components/cinematic/cinematic.css";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="cine is-story cine-notfound">
      <header className="cine-header">
        <Link className="cine-wordmark" href="/" aria-label="Toyyo, all cars">Toyyo</Link>
      </header>
      <main className="cine-notfound-main">
        <p className="cine-eyebrow">Error 404</p>
        <h1>This road doesn’t lead anywhere.</h1>
        <p className="cine-notfound-lead">The link may be incomplete, or the page has moved. Your cars are all on the home screen.</p>
        <Link className="cine-notfound-primary" href="/">See all cars <span aria-hidden="true">→</span></Link>
        <nav aria-label="Your cars" className="cine-notfound-stories">
          <p className="cine-eyebrow">Or go straight to a car</p>
          <ul>
            {VEHICLES.map((vehicle, i) => (
              <li key={vehicle.id}>
                <Link href={carPath(vehicle.id)}><span>{String(i + 1).padStart(2, "0")}</span>{vehicle.name}<small>{vehicle.descriptor}</small></Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
