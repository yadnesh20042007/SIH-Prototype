'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { InstrumentSessionActions } from '@/components/Registry/InstrumentSessionActions';
import { ComplianceIcon } from '@/components/ui/ComplianceIcon';
import { Card, Field, Select, TextInput } from '@/components/ui/FormField';

interface ManufacturerRecord {
  id: string;
  name: string;
  country: string | null;
  registrationCode: string | null;
}

interface InstrumentRecord {
  id: string;
  manufacturerId: string;
  manufacturer: ManufacturerRecord;
  model: string;
  serialNumber: string | null;
  accuracyClass: string;
  instrumentType: string;
  max: string;
  min: string;
  e: string;
  d: string;
}

interface ApiErrorPayload {
  error?: unknown;
  errors?: Array<{ field?: unknown; message?: unknown }>;
}

const ACCURACY_CLASSES = [
  { value: 'I', label: 'I — Special accuracy' },
  { value: 'II', label: 'II — High accuracy' },
  { value: 'III', label: 'III — Medium accuracy' },
  { value: 'IIII', label: 'IIII — Ordinary accuracy' },
];

const INSTRUMENT_TYPES = [
  { value: 'SINGLE_RANGE', label: 'Single range' },
  { value: 'MULTI_RANGE', label: 'Multi-range' },
  { value: 'MULTI_INTERVAL', label: 'Multi-interval' },
];

function apiError(payload: ApiErrorPayload, status: number): string {
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map(({ field, message }) =>
        typeof field === 'string' && typeof message === 'string'
          ? `${field}: ${message}`
          : null
      )
      .filter(Boolean)
      .join('; ');
  }
  return typeof payload.error === 'string'
    ? payload.error
    : `Request failed with status ${status}.`;
}

async function responseBody(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

async function fetchRegistryData(): Promise<{
  instruments: InstrumentRecord[];
  manufacturers: ManufacturerRecord[];
}> {
  const [instrumentResponse, manufacturerResponse] = await Promise.all([
    fetch('/api/instruments'),
    fetch('/api/manufacturers'),
  ]);
  if (!instrumentResponse.ok) {
    throw new Error(apiError(await responseBody(instrumentResponse), instrumentResponse.status));
  }
  if (!manufacturerResponse.ok) {
    throw new Error(apiError(await responseBody(manufacturerResponse), manufacturerResponse.status));
  }
  return {
    instruments: (await instrumentResponse.json()) as InstrumentRecord[],
    manufacturers: (await manufacturerResponse.json()) as ManufacturerRecord[],
  };
}

function Message({ children, tone }: { children: string; tone: 'error' | 'success' }) {
  const styles =
    tone === 'error'
      ? 'border-[#F3C7C7] bg-[#FEF3F2] text-[#B42318]'
      : 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]';
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`m-0 rounded-[5px] border px-3 py-2 text-[0.72rem] leading-relaxed ${styles}`}>
      {children}
    </p>
  );
}

export function RegistryScreen() {
  const [manufacturers, setManufacturers] = useState<ManufacturerRecord[]>([]);
  const [instruments, setInstruments] = useState<InstrumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manufacturerMessage, setManufacturerMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [instrumentMessage, setInstrumentMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [savingManufacturer, setSavingManufacturer] = useState(false);
  const [savingInstrument, setSavingInstrument] = useState(false);

  const [manufacturerForm, setManufacturerForm] = useState({
    name: '',
    country: '',
    registrationCode: '',
  });
  const [instrumentForm, setInstrumentForm] = useState({
    manufacturerId: '',
    model: '',
    serialNumber: '',
    accuracyClass: 'III',
    instrumentType: 'SINGLE_RANGE',
    max: '',
    min: '',
    e: '',
    d: '',
    numberOfSupportPoints: '4',
  });

  async function loadRegistry() {
    try {
      const data = await fetchRegistryData();
      setInstruments(data.instruments);
      setManufacturers(data.manufacturers);
      setInstrumentForm((current) => ({
        ...current,
        manufacturerId: current.manufacturerId || data.manufacturers[0]?.id || '',
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load the instrument registry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchRegistryData()
      .then((data) => {
        if (!active) return;
        setInstruments(data.instruments);
        setManufacturers(data.manufacturers);
        setInstrumentForm((current) => ({
          ...current,
          manufacturerId: current.manufacturerId || data.manufacturers[0]?.id || '',
        }));
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load the instrument registry.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function refreshRegistry() {
    setLoading(true);
    setLoadError(null);
    void loadRegistry();
  }

  async function registerManufacturer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingManufacturer(true);
    setManufacturerMessage(null);
    try {
      const response = await fetch('/api/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manufacturerForm.name,
          country: manufacturerForm.country || null,
          registrationCode: manufacturerForm.registrationCode || null,
        }),
      });
      const payload = await responseBody(response);
      if (!response.ok) throw new Error(apiError(payload, response.status));

      const created = payload as unknown as ManufacturerRecord;
      setManufacturers((current) => [...current, created]);
      setInstrumentForm((current) => ({ ...current, manufacturerId: created.id }));
      setManufacturerForm({ name: '', country: '', registrationCode: '' });
      setManufacturerMessage({ tone: 'success', text: 'Manufacturer registered successfully.' });
    } catch (error) {
      setManufacturerMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to register the manufacturer.',
      });
    } finally {
      setSavingManufacturer(false);
    }
  }

  async function registerInstrument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingInstrument(true);
    setInstrumentMessage(null);
    try {
      const response = await fetch('/api/instruments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturerId: instrumentForm.manufacturerId,
          model: instrumentForm.model,
          serialNumber: instrumentForm.serialNumber || null,
          accuracyClass: instrumentForm.accuracyClass,
          instrumentType: instrumentForm.instrumentType,
          max: instrumentForm.max,
          min: instrumentForm.min,
          e: instrumentForm.e,
          d: instrumentForm.d,
          numberOfSupportPoints: instrumentForm.numberOfSupportPoints,
        }),
      });
      const payload = await responseBody(response);
      if (!response.ok) throw new Error(apiError(payload, response.status));

      const created = payload as unknown as InstrumentRecord;
      setInstruments((current) => [created, ...current]);
      setInstrumentForm((current) => ({
        ...current,
        model: '',
        serialNumber: '',
        max: '',
        min: '',
        e: '',
        d: '',
      }));
      setInstrumentMessage({ tone: 'success', text: 'Instrument registered successfully.' });
    } catch (error) {
      setInstrumentMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to register the instrument.',
      });
    } finally {
      setSavingInstrument(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <Card title="Register Manufacturer" sectionLabel="Registry 01" subtitle="Add the legal manufacturer before registering its instruments." icon={<ComplianceIcon name="instrument" />}>
          <form onSubmit={registerManufacturer} className="grid gap-3">
            <Field label="Manufacturer Name">
              <TextInput value={manufacturerForm.name} onChange={(name) => setManufacturerForm((current) => ({ ...current, name }))} placeholder="e.g. Acme Weighing" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Country" hint="Optional">
                <TextInput value={manufacturerForm.country} onChange={(country) => setManufacturerForm((current) => ({ ...current, country }))} placeholder="e.g. India" />
              </Field>
              <Field label="Registration Code" hint="Optional, must be unique">
                <TextInput value={manufacturerForm.registrationCode} onChange={(registrationCode) => setManufacturerForm((current) => ({ ...current, registrationCode }))} placeholder="e.g. MFG-001" />
              </Field>
            </div>
            {manufacturerMessage && <Message tone={manufacturerMessage.tone}>{manufacturerMessage.text}</Message>}
            <div className="flex justify-end">
              <button type="submit" disabled={savingManufacturer} className="rounded-[5px] bg-[#0A66C2] px-4 py-2.5 text-[0.76rem] font-bold text-white transition-colors hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#98A2B3]">
                {savingManufacturer ? 'Registering…' : 'Register Manufacturer'}
              </button>
            </div>
          </form>
        </Card>

        <Card title="Register Instrument" sectionLabel="Registry 02" subtitle="Store the instrument identity and declared metrological configuration." icon={<ComplianceIcon name="instrument" />}>
          <form onSubmit={registerInstrument} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Manufacturer">
                <Select value={instrumentForm.manufacturerId} onChange={(manufacturerId) => setInstrumentForm((current) => ({ ...current, manufacturerId }))} disabled={manufacturers.length === 0} options={[{ value: '', label: manufacturers.length ? 'Select manufacturer' : 'Register a manufacturer first' }, ...manufacturers.map(({ id, name }) => ({ value: id, label: name }))]} />
              </Field>
              <Field label="Model">
                <TextInput value={instrumentForm.model} onChange={(model) => setInstrumentForm((current) => ({ ...current, model }))} placeholder="e.g. AVX-500" />
              </Field>
              <Field label="Serial Number" hint="Optional">
                <TextInput value={instrumentForm.serialNumber} onChange={(serialNumber) => setInstrumentForm((current) => ({ ...current, serialNumber }))} placeholder="Optional" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="Accuracy Class">
                <Select value={instrumentForm.accuracyClass} onChange={(accuracyClass) => setInstrumentForm((current) => ({ ...current, accuracyClass }))} options={ACCURACY_CLASSES} />
              </Field>
              <Field label="Instrument Type">
                <Select value={instrumentForm.instrumentType} onChange={(instrumentType) => setInstrumentForm((current) => ({ ...current, instrumentType }))} options={INSTRUMENT_TYPES} />
              </Field>
              <Field label="Max (kg)">
                <TextInput type="number" step="any" value={instrumentForm.max} onChange={(max) => setInstrumentForm((current) => ({ ...current, max }))} placeholder="30" />
              </Field>
              <Field label="Min (kg)">
                <TextInput type="number" step="any" value={instrumentForm.min} onChange={(min) => setInstrumentForm((current) => ({ ...current, min }))} placeholder="0.2" />
              </Field>
              <Field label="Verification Interval (e, kg)">
                <TextInput type="number" step="any" value={instrumentForm.e} onChange={(e) => setInstrumentForm((current) => ({ ...current, e }))} placeholder="0.01" />
              </Field>
              <Field label="Actual Interval (d, kg)">
                <TextInput type="number" step="any" value={instrumentForm.d} onChange={(d) => setInstrumentForm((current) => ({ ...current, d }))} placeholder="0.005" />
              </Field>
              <Field label="Support Points">
                <TextInput type="number" value={instrumentForm.numberOfSupportPoints} onChange={(numberOfSupportPoints) => setInstrumentForm((current) => ({ ...current, numberOfSupportPoints }))} placeholder="4" />
              </Field>
            </div>
            {instrumentMessage && <Message tone={instrumentMessage.tone}>{instrumentMessage.text}</Message>}
            <div className="flex justify-end">
              <button type="submit" disabled={savingInstrument || manufacturers.length === 0} className="rounded-[5px] bg-[#0A66C2] px-4 py-2.5 text-[0.76rem] font-bold text-white transition-colors hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#98A2B3]">
                {savingInstrument ? 'Registering…' : 'Register Instrument'}
              </button>
            </div>
          </form>
        </Card>
      </div>

      <Card title="Registered Instruments" sectionLabel="Registry 03" subtitle="Select an instrument to begin its OIML R76 laboratory evaluation." action={<button type="button" onClick={refreshRegistry} disabled={loading} className="rounded-[5px] border border-[#BFCEDC] bg-white px-3 py-1.5 text-[0.68rem] font-semibold text-[#344054] hover:border-[#0A66C2] hover:text-[#0A66C2] disabled:opacity-50">Refresh</button>}>
        {loading ? (
          <div role="status" className="rounded-md border border-[#E4EAF0] bg-[#F8FAFC] px-4 py-8 text-center text-[0.78rem] text-[#667085]">Loading registered instruments…</div>
        ) : loadError ? (
          <div className="grid justify-items-center gap-3 rounded-md border border-[#F3C7C7] bg-[#FEF3F2] px-4 py-7 text-center">
            <p role="alert" className="m-0 text-[0.78rem] text-[#B42318]">{loadError}</p>
            <button type="button" onClick={refreshRegistry} className="rounded-[5px] border border-[#D92D20] bg-white px-3 py-1.5 text-[0.7rem] font-semibold text-[#B42318]">Try Again</button>
          </div>
        ) : instruments.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#BFCEDC] bg-[#FBFCFD] px-5 py-10 text-center">
            <p className="m-0 text-[0.82rem] font-semibold text-[#344054]">No instruments registered</p>
            <p className="m-0 mt-1 text-[0.72rem] text-[#667085]">Register a manufacturer and the first instrument above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#D9E2EC] bg-[#F8FAFC]">
                  {['Manufacturer', 'Model', 'Class', 'Max', 'Min', 'e', 'd', 'Type', ''].map((heading) => (
                    <th key={heading || 'action'} className="px-3 py-2.5 text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[#667085]">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instruments.map((item) => (
                  <tr key={item.id} className="border-b border-[#E4EAF0] last:border-0 hover:bg-[#FAFCFE]">
                    <td className="px-3 py-3 text-[0.76rem] font-semibold text-[#1D2226]">{item.manufacturer.name}</td>
                    <td className="px-3 py-3 text-[0.76rem] text-[#344054]">{item.model}</td>
                    <td className="px-3 py-3 text-[0.72rem] font-semibold text-[#004182]">{item.accuracyClass}</td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-[#344054]">{item.max} kg</td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-[#344054]">{item.min} kg</td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-[#344054]">{item.e} kg</td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-[#344054]">{item.d} kg</td>
                    <td className="px-3 py-3 text-[0.7rem] text-[#667085]">{item.instrumentType.replaceAll('_', ' ')}</td>
                    <td className="px-3 py-3 text-right">
                      <InstrumentSessionActions instrumentId={item.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
