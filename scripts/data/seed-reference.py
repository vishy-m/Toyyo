"""Synthetic scenario fixtures. All prices are demo assumptions, not live offers."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
def write(path, value):
    (ROOT / path).write_text(json.dumps(value, indent=2) + '\n')
def pmt(principal, apr, months):
    r = apr / 1200
    return round(principal*r/(1-(1+r)**(-months)),2)
models = [('camry','Camry Hybrid SE',2025,28000,349,'sedan'),('rav4','RAV4 Hybrid XLE',2021,34000,419,'suv'),('corolla','Corolla LE',2024,23500,279,'sedan'),('tacoma','Tacoma TRD Off-Road',2021,39000,479,'truck'),('4runner','4Runner TRD Off-Road',2025,49950,569,'suv'),('highlander','Highlander Hybrid',2025,46620,549,'suv'),('camry-2026','Camry',2026,29895,359,'sedan')]
write('data/reference/model-prices.json', {slug:dict(name=name,year=year,msrp=price,leasePayment=lease,leaseTermMonths=36,financePayment=pmt(price,5.9,60),financeApr=5.9,financeTermMonths=60,modelAsset=f'/models/{slug if slug != "camry-2026" else "camry"}.glb',bodyStyle=body) for slug,name,year,price,lease,body in models})
values=[20980,28500,19200,30200,44000,41000,27500]
write('data/reference/market-values.json',[dict(model=name,year=year,bands=[dict(maxMiles=30000,value=value+1500),dict(maxMiles=60000,value=value),dict(maxMiles=100000,value=value-3500),dict(maxMiles=999999,value=value-6500)]) for (_,name,year,*_),value in zip(models,values)])
extra_values=[('Land Cruiser',2017,47000),('Hilux',2007,17000),('Corolla Cross LE',2025,22400),('GR Yaris',2020,38500)]
mv=json.loads((ROOT/'data/reference/market-values.json').read_text())
mv+= [dict(model=name,year=year,bands=[dict(maxMiles=30000,value=value+1500),dict(maxMiles=60000,value=value),dict(maxMiles=100000,value=value-3500),dict(maxMiles=999999,value=value-6500)]) for name,year,value in extra_values]
write('data/reference/market-values.json',mv)
write('data/reference/rates.json',dict(asOf='2026-10-27',simulated=True,aprByCreditTier=dict(excellent=3.9,good=5.9,fair=8.9,building=11.9),refinanceFee=150,autopayDiscountApr=0.25,dispositionFee=350,purchaseOptionFee=300,texasSalesTax=0.0625,gasPricePerGallon=3.05,leaseStartingOdometer=dict(maya=7500,raj=0)))
write('data/reference/insurance-tiers.json',dict(simulated=True,bands=[dict(minScore=90,multiplier=.78),dict(minScore=80,multiplier=.88),dict(minScore=70,multiplier=1),dict(minScore=60,multiplier=1.12),dict(minScore=0,multiplier=1.25)],basePremium=dict(maya=185,garcia=185,jordan=248,raj=205,nora=210,eli=150,ava=192,theo=238)))
people=[('maya','Maya','Maya, 29 · Austin commuter',29,'Austin','🌇','camry','#B3122E',41200,True,48,'good','lease-end',[.15,.25,.5,.1],[]),('garcia','The Garcias','The Garcias, 38/36 · New parents',38,'San Antonio','🌱','rav4','#2B3F5C',23100,True,40,'excellent','payment',[.65,.2,.05,.1],['new baby (3 mo)']),('jordan','Jordan','Jordan, 22 · Houston driver',22,'Houston','🌙','corolla','#8FA9B8',18700,False,35,'building','insurance',[.65,.15,.15,.05],[]),('raj','Raj','Raj, 45 · Hill Country explorer',45,'Austin','🏕️','tacoma','#5B6142',41500,False,20,'good','lease-end',[.1,.1,.15,.65],['weekend camping'])]
for id,name,display,age,city,emoji,slug,paint,odo,hybrid,mpg,credit,best,weights,events in people:
    model=next(x for x in models if x[0]==slug)
    if id=='maya': contract=dict(kind='lease',startDate='2024-11-27',termMonths=27,monthsRemaining=4,monthlyPayment=389,annualMileageAllowance=16000,overageRatePerMile=.25,residualValue=19400,purchaseOptionFee=300,dispositionFee=350)
    elif id=='raj': contract=dict(kind='lease',startDate='2022-05-27',termMonths=60,monthsRemaining=7,monthlyPayment=489,annualMileageAllowance=15000,overageRatePerMile=.25,residualValue=29400,purchaseOptionFee=300,dispositionFee=350)
    else:
        principal,apr,months=(23800,6.9,31) if id=='garcia' else (17400,11.9,42)
        contract=dict(kind='loan',startDate='2024-05-27' if id=='garcia' else '2025-04-27',termMonths=60,monthsRemaining=months,monthlyPayment=pmt(principal,apr,months),apr=apr,principalRemaining=principal,autopay=id=='garcia')
    write(f'data/personas/{id}.json',dict(id=id,name=name,displayName=display,age=age,city=city,avatarEmoji=emoji,vehicle=dict(year=model[2],make='Toyota',model=model[1],bodyStyle=model[5],modelAsset='/models/cinematic/optimized/toyota-rav4.glb' if id=='garcia' else f'/models/{slug}.glb',paintHex=paint,odometer=odo,vin=f'SYNTHETIC-{id.upper()}-001',isHybrid=hybrid,mpg=mpg),contract=contract,insurance=dict(carrier='Lone Star Mutual (simulated)',monthlyPremium=dict(maya=156,garcia=152,jordan=248,raj=168)[id],usageBased=False),toyotaCare=dict(startDate='2024-12-15' if id=='garcia' else contract['startDate'],expiresMonths=24,expiresMiles=25000),creditTier=credit,consent=dict(driving=True,banking=True,paymentHistory=True,shareWithInsurers=id!='jordan'),preferences=dict(priorityWeights=dict(zip(['monthlyPayment','totalCost','flexibility','lifestyleFit'],weights)),detailLevel='standard',format='bullets',lifestyleTags=[],suppressedMoveTypes=[],dismissed=[],accepted=[],learned=[]),lifeEvents=events,intendedBestMove=best))
    write(f'data/cashflow/{id}.json',dict(payday='biweekly-fri' if id in ['jordan','raj'] else 'semimonthly-1-15',avgBalance=dict(maya=3400,garcia=2600,jordan=560,raj=6200)[id],paymentDueDay=3 if id=='jordan' else 18,latePaymentsLast12=2 if id=='jordan' else 0,recurringShortfall=False))
    if not (ROOT/f'data/trips/{id}.trips.json').exists(): write(f'data/trips/{id}.trips.json',[])

# Jordan drives a GR Supra (matches the carousel asset); model-prices has no Supra row.
jordan_path = ROOT/'data/personas/jordan.json'
jordan = json.loads(jordan_path.read_text())
jordan['vehicle'].update(model='GR Supra 2.0', modelAsset='/models/gr-supra.glb', mpg=29)
write('data/personas/jordan.json', jordan)

# Four cinematic-carousel cases. Loans are derived from an original amount so payment,
# principal remaining and months remaining agree with the 2026-10-27 scenario clock.
def balance(principal, apr, months, paid):
    r, pay, b = apr/1200, principal*(apr/1200)/(1-(1+apr/1200)**(-months)), principal
    for _ in range(paid): b = b*(1+r)-pay
    return round(b), round(pay, 2)
new_people = [
    dict(id='nora', name='Nora', display='Nora, 52 · Hill Country family driver', age=52, city='Boerne', emoji='⛰️',
         vehicle=dict(year=2017, model='Land Cruiser', bodyStyle='suv', asset='/models/cinematic/optimized/toyota-land-cruiser.glb', paint='#D3D0C5', odometer=96400, hybrid=False, mpg=15),
         loan=dict(start='2025-02-27', original=41500, apr=7.4, term=72, paid=20, autopay=False),
         care='2017-03-10', credit='good', carrier='Lone Star Mutual (simulated)', premium=158, best='payment',
         weights=[.2,.45,.2,.15], events=[], cash=dict(payday='semimonthly-1-15', avgBalance=4100, paymentDueDay=18, late=0)),
    dict(id='eli', name='Eli', display='Eli, 41 · San Juan workshop maker', age=41, city='San Juan', emoji='🔧',
         vehicle=dict(year=2007, model='Hilux', bodyStyle='truck', asset='/models/cinematic/optimized/toyota-hilux.glb', paint='#A8B0AA', odometer=187400, hybrid=False, mpg=24),
         loan=dict(start='2025-01-27', original=17900, apr=12.9, term=48, paid=21, autopay=False),
         care='2007-06-01', credit='good', carrier='Isla Mutual (simulated)', premium=112, best='payment',
         weights=[.3,.45,.15,.1], events=['workshop tools in the truck'], cash=dict(payday='semimonthly-1-15', avgBalance=1700, paymentDueDay=18, late=0)),
    dict(id='ava', name='Ava', display='Ava, 24 · First-car owner', age=24, city='Dallas', emoji='📚',
         vehicle=dict(year=2025, model='Corolla Cross LE', bodyStyle='suv', asset='/models/cinematic/optimized/toyota-corolla-cross.glb', paint='#D6D5CA', odometer=11900, hybrid=False, mpg=32),
         loan=dict(start='2025-08-27', original=25900, apr=11.4, term=72, paid=14, autopay=False),
         care='2025-08-27', credit='building', carrier='Lone Star Mutual (simulated)', premium=144, best='payment',
         weights=[.55,.2,.15,.1], events=['first financed car'], cash=dict(payday='biweekly-fri', avgBalance=780, paymentDueDay=3, late=1)),
    dict(id='theo', name='Theo', display='Theo, 27 · Daily-driver enthusiast', age=27, city='Fort Worth', emoji='🏁',
         vehicle=dict(year=2020, model='GR Yaris', bodyStyle='sedan', asset='/models/cinematic/optimized/toyota-yaris.glb', paint='#C9D0D2', odometer=31500, hybrid=False, mpg=29),
         loan=dict(start='2025-09-27', original=33000, apr=6.4, term=60, paid=13, autopay=True),
         care='2020-08-15', credit='good', carrier='Lone Star Mutual (simulated)', premium=212, best='insurance',
         weights=[.35,.3,.2,.15], events=[], cash=dict(payday='biweekly-fri', avgBalance=2300, paymentDueDay=18, late=0)),
]
for n in new_people:
    v, l = n['vehicle'], n['loan']
    principal, monthly = balance(l['original'], l['apr'], l['term'], l['paid'])
    write(f"data/personas/{n['id']}.json", dict(id=n['id'], name=n['name'], displayName=n['display'], age=n['age'], city=n['city'], avatarEmoji=n['emoji'],
        vehicle=dict(year=v['year'], make='Toyota', model=v['model'], bodyStyle=v['bodyStyle'], modelAsset=v['asset'], paintHex=v['paint'], odometer=v['odometer'], vin=f"SYNTHETIC-{n['id'].upper()}-001", isHybrid=v['hybrid'], mpg=v['mpg']),
        contract=dict(kind='loan', startDate=l['start'], termMonths=l['term'], monthsRemaining=l['term']-l['paid'], monthlyPayment=monthly, apr=l['apr'], principalRemaining=principal, autopay=l['autopay']),
        insurance=dict(carrier=n['carrier'], monthlyPremium=n['premium'], usageBased=False),
        toyotaCare=dict(startDate=n['care'], expiresMonths=24, expiresMiles=25000), creditTier=n['credit'],
        consent=dict(driving=True, banking=True, paymentHistory=True, shareWithInsurers=True),
        preferences=dict(priorityWeights=dict(zip(['monthlyPayment','totalCost','flexibility','lifestyleFit'], n['weights'])), detailLevel='standard', format='bullets', lifestyleTags=[], suppressedMoveTypes=[], dismissed=[], accepted=[], learned=[]),
        lifeEvents=n['events'], intendedBestMove=n['best']))
    c = n['cash']
    write(f"data/cashflow/{n['id']}.json", dict(payday=c['payday'], avgBalance=c['avgBalance'], paymentDueDay=c['paymentDueDay'], latePaymentsLast12=c['late'], recurringShortfall=False))
    if not (ROOT/f"data/trips/{n['id']}.trips.json").exists(): write(f"data/trips/{n['id']}.trips.json", [])
