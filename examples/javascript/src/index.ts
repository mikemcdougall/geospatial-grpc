import { FeatureService } from './gen/geospatial/v1/feature_service_pb.js';
import { FormService } from './gen/geospatial/v1/form_service_pb.js';
import {
  QueryFeaturesRequest,
  SpatialReference,
  GetFormDefinitionRequest,
  MobileCapabilities,
  NetworkType,
  BatteryLevel,
  SubmitFormDataRequest,
  FormInstance,
  InstanceStatus,
  SubmissionMetadata,
  AttributeValue,
} from './gen/geospatial/v1/feature_service_pb.js';
import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';

// Configure transport
const transport = createGrpcTransport({
  baseUrl: 'https://demo.geospatial-grpc.org',
  httpVersion: '2',
  acceptCompression: ['gzip'],
});

async function main() {
  console.log('🌍 Geospatial gRPC JavaScript Example');
  console.log('====================================\n');

  await runFeatureServiceExample();
  await runFormServiceExample();
}

async function runFeatureServiceExample() {
  console.log('📍 Feature Service Example');
  console.log('--------------------------');

  const client = createClient(FeatureService, transport);

  try {
    // Query parks in San Francisco with area > 1000 sq ft
    const request = new QueryFeaturesRequest({
      serviceId: 'sf-parks',
      layerId: 0,
      where: 'AREA > 1000',
      returnGeometry: true,
      outSr: new SpatialReference({ wkid: 4326 }), // WGS84
      resultRecordCount: 10,
    });

    const response = await client.queryFeatures(request);

    console.log(`Found ${response.features.length} parks:`);
    for (const feature of response.features) {
      const nameAttr = feature.attributes['NAME'];
      const name = nameAttr?.stringValue || 'Unknown';

      console.log(`  • ${name} (ID: ${feature.id})`);

      if (feature.geometry?.point) {
        const { x, y } = feature.geometry.point;
        console.log(`    Location: ${x.toFixed(6)}, ${y.toFixed(6)}`);
      }
    }
  } catch (error) {
    console.error('❌ Error querying features:', error);
  }

  console.log();
}

async function runFormServiceExample() {
  console.log('📋 Form Service Example');
  console.log('----------------------');

  const client = createClient(FormService, transport);

  try {
    // Get park inspection form definition
    const formRequest = new GetFormDefinitionRequest({
      formId: 'park-inspection',
      serviceId: 'sf-parks',
      layerId: 0,
      mobileCapabilities: new MobileCapabilities({
        hasCamera: true,
        hasGps: true,
        platform: 'javascript',
        deviceType: 'desktop',
        networkType: NetworkType.WIFI,
        batteryLevel: BatteryLevel.HIGH,
      }),
    });

    const formResponse = await client.getFormDefinition(formRequest);
    const form = formResponse.form!;

    console.log(`Form: ${form.title}`);
    console.log(`Description: ${form.description}`);
    console.log(`Version: ${form.version}`);
    console.log(`Controls (${form.controls.length}):`);

    const sortedControls = [...form.controls].sort((a, b) => a.displayOrder - b.displayOrder);

    for (const control of sortedControls) {
      const controlType = getControlTypeName(control.controlType.case);
      const required = control.required ? '*' : ' ';

      console.log(`  ${required} ${control.label} (${controlType})`);

      if (control.hint) {
        console.log(`      Hint: ${control.hint}`);
      }
    }

    // Demonstrate form submission
    await demonstrateFormSubmission(client, form);
  } catch (error) {
    console.error('❌ Error with form service:', error);
  }

  console.log();
}

async function demonstrateFormSubmission(client: ReturnType<typeof createClient<typeof FormService>>, form: any) {
  console.log('\n📤 Submitting sample form data...');

  const instanceId = crypto.randomUUID();
  const now = Date.now();

  const submission = new SubmitFormDataRequest({
    formId: form.formId,
    formVersion: form.version,
    instance: new FormInstance({
      instanceId,
      formId: form.formId,
      createdBy: 'demo-user',
      status: InstanceStatus.COMPLETE,
      createdAt: now,
      modifiedAt: now,
      fieldValues: {},
    }),
    metadata: new SubmissionMetadata({
      deviceId: 'javascript-example',
      platform: 'javascript-example',
      appVersion: '1.0.0',
      latitude: 37.7749, // San Francisco
      longitude: -122.4194,
      submissionTime: now,
    }),
  });

  // Add sample field values based on form controls
  for (const control of form.controls) {
    let value: AttributeValue;

    switch (control.controlType.case) {
      case 'textInput':
        value = new AttributeValue({ stringValue: 'Sample text value' });
        break;
      case 'numericInput':
        value = new AttributeValue({ int32Value: 42 });
        break;
      case 'booleanControl':
        value = new AttributeValue({ boolValue: true });
        break;
      case 'datetimeControl':
        value = new AttributeValue({ datetimeValue: now });
        break;
      case 'locationControl':
        value = new AttributeValue({ stringValue: 'POINT(-122.4194 37.7749)' });
        break;
      default:
        value = new AttributeValue({ stringValue: 'Default value' });
    }

    submission.instance!.fieldValues[control.controlId] = value;
  }

  try {
    const submitResponse = await client.submitFormData(submission);

    if (submitResponse.result?.success) {
      console.log('✅ Form submitted successfully!');
      console.log(`   Created feature ID: ${submitResponse.createdFeatureId}`);
      console.log(`   Server timestamp: ${new Date(submitResponse.result.serverTimestamp)}`);
    } else {
      console.log(`❌ Form submission failed: ${submitResponse.result?.message}`);
      for (const issue of submitResponse.validationIssues) {
        console.log(`   • ${issue.fieldId}: ${issue.message}`);
      }
    }
  } catch (error) {
    console.error('❌ Error submitting form:', error);
  }
}

function getControlTypeName(controlType: string | undefined): string {
  switch (controlType) {
    case 'textInput': return 'Text Input';
    case 'numericInput': return 'Numeric Input';
    case 'selectControl': return 'Select';
    case 'datetimeControl': return 'Date/Time';
    case 'locationControl': return 'Location';
    case 'mediaControl': return 'Media';
    case 'booleanControl': return 'Boolean';
    default: return 'Other';
  }
}

// Run the example
main().catch(console.error);